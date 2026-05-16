const WS_READY_STATE_OPEN = 1;
  const WS_READY_STATE_CLOSING = 2;

  export default {
    async fetch(request, env) {
      const userID = env.USER_ID || '1c0aed11-4836-4431-b028-14e15dfe033c';
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        return handleWebSocket(request, userID);
      }
      return new Response('Service running', { status: 200 });
    }
  };

  async function handleWebSocket(request, userID) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    let remoteSocket = { value: null };
    let udpWrite = null;
    let isDns = false;
    const readableStream = makeReadableWebSocketStream(server);
    readableStream.pipeTo(new WritableStream({
      async write(chunk) {
        if (isDns && udpWrite) { udpWrite(chunk); return; }
        if (remoteSocket.value) {
          const writer = remoteSocket.value.writable.getWriter();
          await writer.write(chunk);
          writer.releaseLock();
          return;
        }
        const { hasError, portRemote = 443, addressRemote = '', rawDataIndex, vlessVersion = new Uint8Array([0, 0]), isUDP } = processVlessHeader(chunk, userID);
        if (hasError) return;
        if (isUDP && portRemote === 53) isDns = true;
        const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
        const rawClientData = chunk.slice(rawDataIndex);
        if (isDns) {
          const { write } = await handleUdpOutBound(server, vlessResponseHeader);
          udpWrite = write;
          udpWrite(rawClientData);
          return;
        }
        handleTcpOutBound(remoteSocket, addressRemote, portRemote, rawClientData, server, vlessResponseHeader);
      }
    })).catch(() => {});
    return new Response(null, { status: 101, webSocket: client });
  }

  async function handleTcpOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader) {
    async function connectAndWrite(address, port) {
      const tcpSocket = connect({ hostname: address, port });
      remoteSocket.value = tcpSocket;
      const writer = tcpSocket.writable.getWriter();
      await writer.write(rawClientData);
      writer.releaseLock();
      return tcpSocket;
    }
    async function retry() {
      const tcpSocket = await connectAndWrite(addressRemote, portRemote);
      tcpSocket.closed.catch(() => {}).finally(() => safeCloseWebSocket(webSocket));
      remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null);
    }
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
    remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry);
  }

  function makeReadableWebSocketStream(webSocketServer) {
    let cancelled = false;
    return new ReadableStream({
      start(controller) {
        webSocketServer.addEventListener('message', (event) => {
          if (!cancelled) controller.enqueue(event.data);
        });
        webSocketServer.addEventListener('close', () => {
          safeCloseWebSocket(webSocketServer);
          if (!cancelled) controller.close();
        });
        webSocketServer.addEventListener('error', (err) => controller.error(err));
      },
      cancel() { cancelled = true; safeCloseWebSocket(webSocketServer); }
    });
  }

  function processVlessHeader(vlessBuffer, userID) {
    if (vlessBuffer.byteLength < 24) return { hasError: true };
    const version = new Uint8Array(vlessBuffer.slice(0, 1));
    const uuidBytes = new Uint8Array(vlessBuffer.slice(1, 17));
    const uuidHex = Array.from(uuidBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const reconstructedUUID = [uuidHex.slice(0,8), uuidHex.slice(8,12), uuidHex.slice(12,16), uuidHex.slice(16,20), uuidHex.slice(20)].join('-');
    if (userID !== reconstructedUUID) return { hasError: true };
    const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
    const command = new Uint8Array(vlessBuffer.slice(18 + optLength, 19 + optLength))[0];
    let isUDP = false;
    if (command === 1) {}
    else if (command === 2) { isUDP = true; }
    else return { hasError: true };
    const portIndex = 19 + optLength;
    const portRemote = new DataView(vlessBuffer.slice(portIndex, portIndex + 2)).getUint16(0);
    let addrIndex = portIndex + 2;
    const addrType = new Uint8Array(vlessBuffer.slice(addrIndex, addrIndex + 1))[0];
    let addrLength = 0, addrValueIndex = addrIndex + 1, addrValue = '';
    switch (addrType) {
      case 1:
        addrLength = 4;
        addrValue = new Uint8Array(vlessBuffer.slice(addrValueIndex, addrValueIndex + addrLength)).join('.');
        break;
      case 2:
        addrLength = new Uint8Array(vlessBuffer.slice(addrValueIndex, addrValueIndex + 1))[0];
        addrValueIndex += 1;
        addrValue = new TextDecoder().decode(vlessBuffer.slice(addrValueIndex, addrValueIndex + addrLength));
        break;
      case 3:
        addrLength = 16;
        const ipv6 = [];
        const view = new DataView(vlessBuffer.slice(addrValueIndex, addrValueIndex + addrLength));
        for (let i = 0; i < 8; i++) ipv6.push(view.getUint16(i * 2).toString(16));
        addrValue = ipv6.join(':');
        break;
      default:
        return { hasError: true };
    }
    return { hasError: false, addressRemote: addrValue, portRemote, rawDataIndex: addrValueIndex + addrLength, vlessVersion: version, isUDP };
  }

  async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry) {
    let hasIncomingData = false;
    await remoteSocket.readable.pipeTo(new WritableStream({
      async write(chunk) {
        hasIncomingData = true;
        if (webSocket.readyState !== WS_READY_STATE_OPEN) return;
        if (vlessResponseHeader) {
          webSocket.send(await new Blob([vlessResponseHeader, chunk]).arrayBuffer());
          vlessResponseHeader = null;
        } else {
          webSocket.send(chunk);
        }
      }
    })).catch(() => safeCloseWebSocket(webSocket));
    if (!hasIncomingData && retry) retry();
  }

  function safeCloseWebSocket(socket) {
    try {
      if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) socket.close();
    } catch {}
  }

  async function handleUdpOutBound(webSocket, vlessResponseHeader) {
    let headerSent = false;
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        for (let i = 0; i < chunk.byteLength;) {
          const size = new DataView(chunk.slice(i, i + 2)).getUint16(0);
          controller.enqueue(new Uint8Array(chunk.slice(i + 2, i + 2 + size)));
          i += 2 + size;
        }
      }
    });
    transformStream.readable.pipeTo(new WritableStream({
      async write(chunk) {
        const resp = await fetch('https://1.1.1.1/dns-query', {
          method: 'POST',
          headers: { 'content-type': 'application/dns-message' },
          body: chunk
        });
        const result = await resp.arrayBuffer();
        const sizeBuffer = new Uint8Array([(result.byteLength >> 8) & 0xff, result.byteLength & 0xff]);
        if (webSocket.readyState === WS_READY_STATE_OPEN) {
          if (headerSent) {
            webSocket.send(await new Blob([sizeBuffer, result]).arrayBuffer());
          } else {
            webSocket.send(await new Blob([vlessResponseHeader, sizeBuffer, result]).arrayBuffer());
            headerSent = true;
          }
        }
      }
    })).catch(() => {});
    const writer = transformStream.writable.getWriter();
    return { write: (chunk) => writer.write(chunk) };
  }
  