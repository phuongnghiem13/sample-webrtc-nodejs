const { Server } = require("socket.io");
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const cors = require('cors')

let senderStream;
app.use(cors())

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const io = new Server(8000, {
  cors: true,
});

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();

const users = {};

let adminSocketId = "";

const socketToRoom = {};

app.post("/consumer", async ({ body }, res) => {
  console.log('consumer connected')
    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            }
        ]
    });
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    senderStream.getTracks().forEach(track => peer.addTrack(track, senderStream));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {
        sdp: peer.localDescription
    }
    console.log('payload', payload)

    res.json(payload);
});

app.post('/broadcast', async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            }
        ]
    });
    peer.ontrack = (e) => handleTrackEvent(e, peer);
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {
        sdp: peer.localDescription
    }

    res.json(payload);
});

function handleTrackEvent(e, peer) {
    senderStream = e.streams[0];
};


io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);
  // socket.on("room:join", (data) => {
  //   const { email, room } = data;
  //   emailToSocketIdMap.set(email, socket.id);
  //   socketidToEmailMap.set(socket.id, email);
  //   io.to(room).emit("user:joined", { email, id: socket.id });
  //   socket.join(room);
  //   io.to(socket.id).emit("room:join", data);
  // });
  socket.on("room:join", ({ name, room }) => {
    if (name === "admin") {
      adminSocketId = socket.id;
    }
    console.log("adminSocketId", adminSocketId);
    if (users[room]) {
      // const length = users[room].length;
      // if (length === 4) {
      //   socket.emit("room full");
      //   return;
      // }
      users[room].push(socket.id);
    } else {
      users[room] = [socket.id];
    }
    socketToRoom[socket.id] = room;
    const usersInThisRoom = users[room].filter((id) => id !== socket.id);
    console.log('usersInThisRoom', usersInThisRoom)

    socket.emit("all_users", { users: usersInThisRoom, adminSocketId });
  });

  socket.on("sending_signal", (payload) => {
    io.to(payload.userToSignal).emit("user_joined", {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });

  socket.on("returning_signal", (payload) => {
    io.to(payload.callerID).emit("receiving_returned_signal", {
      signal: payload.signal,
      id: socket.id,
    });
  });

  socket.on("disconnect", () => {
    const roomID = socketToRoom[socket.id];
    let room = users[roomID];
    if (room) {
      room = room.filter((id) => id !== socket.id);
      users[roomID] = room;
    }
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", offer);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", ans);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });
});

app.listen(5000, () => console.log('server started'));

