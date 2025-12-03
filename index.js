import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("✅ User connected", socket.id);

    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        console.log(`📦 ${socket.id} joined room: ${roomId}`);
    });

    socket.on("chat-message", ({ roomId, message }) => {
        io.to(roomId).emit("chat-message", {
            message,
            userId: socket.id
        });
    });

    socket.on("disconnect", () => {
        console.log("❌ User disconnected", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
});
