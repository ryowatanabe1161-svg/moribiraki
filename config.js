/*
 * ふーさんの もりびらき オンライン設定ファイル（必要なときだけ編集してください）
 * - peer: PeerJS シグナリングサーバー。空なら PeerJS 公式の無料クラウド（0.peerjs.com）を使います。
 *         自前の例: { host: 'example.com', port: 443, path: '/myapp', secure: true }
 * - iceServers: WebRTC の STUN / TURN。つながりにくい場合は TURN を追加してください。
 *         例: { urls: 'turns:turn.example.com:443?transport=tcp', username: 'xxx', credential: 'yyy' }
 */
window.MORI_CONFIG = {
  peer: {},
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};
