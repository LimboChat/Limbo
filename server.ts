import "dotenv/config";
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import express, { Request, Response } from 'express';
import { buildHash, candidate, version } from "./version_control/info";

const dev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV == 'development';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const prisma = new PrismaClient();
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const server = express();

server.use(express.json());

function generateUserToken() {
    return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

server.post('/api/authentication', async (req: Request, res: Response) => {
    const { username, authToken } = req.body;

    if (!/^[a-z0-9]{4,16}$/.test(username)) {
        return res.status(400).json({ error: 'Invalid username format' });
    }

    if (!/^[a-f0-9]{128}$/.test(authToken)) {
        return res.status(400).json({ error: 'Invalid authentication token format' });
    }

    const user = await prisma.user.findUnique({
        where: {
            username
        }
    });

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    } else if (user.userToken === authToken) {
        return res.status(200).json({ success: 'Authentication successful' });
    } else {
        return res.status(401).json({ error: 'Invalid authentication token or username' });
    }
});

server.post('/api/login', async (req: Request, res: Response) => {
    const { username, hashedPassword } = req.body;

    if (!/^[a-z0-9]{4,16}$/.test(username)) {
        return res.status(400).json({ error: 'Invalid username format' });
    }

    if (!/^[a-f0-9]{128}$/.test(hashedPassword)) {
        return res.status(400).json({ error: 'Invalid password format' });
    }

    const user = await prisma.user.findUnique({
        where: {
            username
        }
    });

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.hashedPassword === hashedPassword) {
        return res.status(200).json({ success: 'Login successful' });
    } else {
        return res.status(401).json({ error: 'Invalid password' });
    }
});

server.post('/api/register', async (req: Request, res: Response) => {
    const { username, hashedPassword } = req.body;

    if (!/^[a-z0-9]{4,16}$/.test(username)) {
        return res.status(400).json({ error: 'Invalid username format' });
    }

    if (!/^[a-f0-9]{128}$/.test(hashedPassword)) {
        return res.status(400).json({ error: 'Invalid password format' });
    }

    const user = await prisma.user.findUnique({
        where: {
            username
        }
    });

    if (user) {
        return res.status(409).json({ error: 'User already exists' });
    }

    await prisma.user.create({
        data: {
            username,
            hashedPassword,
            userToken: generateUserToken()
        }
    });

    return res.status(201).json({ success: 'User created' });
}); 

app.prepare().then(() => {
    server.all('*', (req, res) => {
        return handle(req, res);
    });

    const httpServer = createServer(server);
    const io = new Server(httpServer);

    io.on("connection", (socket) => {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] User ${socket.id} connected using ${socket.conn.transport.name}`);
        
        socket.on("disconnect", () => {
            console.log(`[${time}] User ${socket.id} disconnected`);
        });

        socket.on("message", (message) => {
            if (message.toString().startsWith("/")) { 
                socket.emit("system", {
                    message: `Sorry, System commands are yet to be implemented.`
                });
            } else {
                io.emit("message", {
                    author: "Anonymous",
                    message: message.toString().trim().substring(0, 1024)
                });
            }
        });
    });

    httpServer.listen(port, () => {
        console.log([
            "",
            " _     _           _           ",
            "| |   (_)_ __ ___ | |__   ___  ",
            "| |   | | '_ ` _ \\| '_ \\ / _ \\ ",
            "| |___| | | | | | | |_) | (_) |",
            "|_____|_|_| |_| |_|_.__/ \\___/ ",
            "",
            `Running Limbo ${version} ${candidate} ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} Mode`,
            `Node ${process.version}`,
            `Limbo build: ${buildHash}`
        ].join('\n'));
        console.log(`Limbo is ready on http://${hostname}:${port}`);
    }).on('error', (err) => {
        console.error(err);
        process.exit(1);
    });
});