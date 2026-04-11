import { handleRemoteInput } from "../game/gameLoop.js";

let peers = {};

export function createPeerConnection(socket, targetId, isInitiator) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    });

    let channel;

    if (isInitiator) {
        channel = pc.createDataChannel("game");

        channel.onopen = () => {
            console.log("DataChannel open to", targetId);
        };

        channel.onmessage = (e) => {
            try {
                const { id, input, state } = JSON.parse(e.data);
                handleRemoteInput(id, input, state);
            } catch (err) {
                console.error("WebRTC Parse Error:", err, e.data);
            }
        };
    } else {
        pc.ondatachannel = (event) => {
            const dataChannel = event.channel;
            if (peers[targetId]) peers[targetId].channel = dataChannel;

            dataChannel.onmessage = (e) => {
                try {
                    const { id, input, state } = JSON.parse(e.data);
                    handleRemoteInput(id, input, state);
                } catch (err) {
                    console.error("WebRTC Parse Error (Joiner):", err, e.data);
                }
            };
        };
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                target: targetId,
                candidate: event.candidate
            });
        }
    };

    peers[targetId] = { pc, channel, id: targetId };

    return pc;
}

export function getPeers() {
    return peers;
}