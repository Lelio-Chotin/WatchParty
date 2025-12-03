import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    socket.username = username;
  });

  socket.on("chat-message", ({ roomId, message }) => {
    io.to(roomId).emit("chat-message", {
      message,
      username: socket.username
    });
  });

  socket.on("video-event", ({ roomId, type, time }) => {
    socket.to(roomId).emit("video-event", {
      type,
      time
    });
  });
});

server.listen(process.env.PORT || 3000);
