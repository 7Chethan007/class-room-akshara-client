# Akshara Frontend - Setup & Deployment Guide

## Overview
This is the frontend application for **Akshara ClassRoom Live**, a real-time video classroom platform built with React, Vite, and Socket.IO. The frontend enables teachers and students to interact in live sessions with video/audio streaming, transcription, and recording capabilities.

**Technology Stack:**
- React 19.2.4
- Vite 8.0.0 (Build tool)
- Socket.IO Client 4.8.3
- Mediasoup Client 3.18.7
- React Router DOM 7.13.1

---

## Prerequisites

Before starting, ensure you have:
- Node.js 20+ installed
- npm or yarn package manager
- Git for version control
- Backend server running on `http://localhost:5001/api`

---

## Getting Started Locally

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `client` directory with the following variables:

```env
# Backend API Configuration
VITE_SERVER_URL=http://localhost:5001
VITE_API_URL=http://localhost:5001/api

# Optional: For production deployment
# VITE_SERVER_URL=http://your-production-api.com
# VITE_API_URL=http://your-production-api.com/api
```

### 3. Run Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

---

## Available Scripts

### Development
```bash
npm run dev          # Start development server with hot reload
```

### Build for Production
```bash
npm run build        # Create optimized production build in 'dist' folder
```

### Preview Production Build
```bash
npm run preview      # Test production build locally
```

### Code Quality
```bash
npm run lint         # Run ESLint to check code quality
```

---

## Project Structure

```
client/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ClassroomNavbar/    # Navigation bar for classroom view
│   │   ├── ControlsBar/        # Media controls (mute, camera, etc.)
│   │   ├── ParticipantsPanel/  # Display connected participants
│   │   ├── PresenterTile/      # Main video feed of presenter
│   │   ├── StudentTiles/       # Gallery view of student videos
│   │   ├── TranscriptionPanel/ # Live transcription display
│   │   └── ...
│   ├── pages/               # Full page components
│   │   ├── ClassroomPage/      # Live classroom session page
│   │   ├── LandingPage/        # Home/landing page
│   │   └── ...
│   ├── hooks/               # Custom React hooks
│   │   └── useTranscription.js # Handle transcription logic
│   ├── services/            # API and external service integrations
│   │   ├── classroomApi.js     # Backend API requests
│   │   └── mediaService.js     # Media stream management
│   ├── App.jsx              # Main app component
│   ├── main.jsx             # React entry point
│   └── index.css             # Global styles
├── public/                  # Static assets (not included in build)
│   ├── index.html           # HTML template
│   ├── js/
│   │   ├── app.js           # Legacy frontend JS
│   │   └── classroom.js     # Legacy classroom JS
│   └── classroom.html       # Legacy classroom view
├── .env                     # Environment variables (local only)
├── vite.config.js           # Vite configuration
├── eslint.config.js         # ESLint rules
├── package.json             # Project metadata and dependencies
└── README.md                # Main documentation

```

---

## Key Features

### 1. Real-Time Video Streaming
- Uses **Mediasoup** for WebRTC media routing
- Supports multiple participants simultaneously
- Teacher and student roles with different permissions

### 2. Live Transcription
- Real-time speech-to-text using OpenAI Whisper
- Transcription appears in dedicated panel
- Download transcripts after session ends

### 3. Recording & Playback
- Sessions can be recorded and stored in AWS S3
- Download or share recordings with participants
- Automatic video quality optimization

### 4. Interactive Features
- Screen sharing support
- Virtual whiteboard (if configured)
- Chat/messaging (if integrated)
- Participant list with status indicators

---

## Connecting to Backend API

The frontend communicates with the backend through two main channels:

### HTTP REST API
Located in `src/services/classroomApi.js`:
- Create/join/end sessions
- Fetch transcriptions and recordings
- User authentication

### WebSocket (Socket.IO)
Real-time communication for:
- Live participant updates
- Session events
- Streaming metadata

**API Endpoints Used:**
- `POST /api/session/create` - Create new classroom session
- `POST /api/session/join` - Join existing session
- `POST /api/session/end` - End session
- `GET /api/session/:sessionId/recording` - Fetch recording
- `GET /api/session/:sessionId/transcript` - Fetch transcription

---

## Building and Deployment

### Docker Deployment (Recommended)

**Build Docker Image:**
```bash
docker build -t akshara-frontend:latest .
```

**Run Container:**
```bash
docker run -d \
  --name akshara-frontend \
  -p 80:3000 \
  -e VITE_SERVER_URL=http://your-backend-ip:5001 \
  -e VITE_API_URL=http://your-backend-ip:5001/api \
  akshara-frontend:latest
```

### Manual Deployment

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Upload `dist/` folder** to your web server (Nginx, Apache, etc.)

3. **Configure your web server** to serve `index.html` for all routes (SPA routing)

**Example Nginx config:**
```nginx
server {
  listen 80;
  server_name your-domain.com;
  
  root /var/www/akshara-frontend/dist;
  
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## Known Issues & Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to server" | Check backend is running on correct port |
| Blank page | Check browser console for JS errors |
| Video not appearing | Verify camera/microphone permissions |
| Transcription not working | Ensure backend has Whisper installed |
| Build fails | Run `npm install` and clear cache: `npm cache clean --force` |

---

## Development Tips

### Debugging
- Open browser DevTools: `F12`
- Check Network tab for API calls
- Check Console for errors
- Use React DevTools extension for component debugging

### Hot Module Reload (HMR)
- Changes to JSX/CSS automatically refresh the browser
- Component state is preserved during reload
- Run `npm run dev` to enable HMR

### Code Style
- Run `npm run lint` before committing
- Fix issues: `npm run lint -- --fix`
- Follow ESLint rules defined in `eslint.config.js`

---

## Dependencies Overview

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.2.4 | UI framework |
| vite | 8.0.0 | Build tool and dev server |
| socket.io-client | 4.8.3 | Real-time communication |
| mediasoup-client | 3.18.7 | WebRTC media streaming |
| react-router-dom | 7.13.1 | Client-side routing |

---

## Performance Optimization

1. **Code Splitting**: Lazy load routes using React Router
2. **Image Optimization**: Compress images before uploading
3. **Bundle Analysis**: Run `npm run build` and check bundle size
4. **Caching**: Browser caches JS/CSS files for faster loading

---

## Contributing

When making changes:
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally: `npm run dev`
3. Run linter: `npm run lint`
4. Commit with clear message: `git commit -m "feat: add new feature"`
5. Push to GitHub: `git push origin feature/your-feature`
6. Create Pull Request with description

---

## Support & Contact

For issues or questions:
- Check the troubleshooting section above
- Review backend logs if API calls fail
- Check GitHub issues for similar problems
- Contact development team for urgent issues

---

## License

This project is part of Akshara ClassRoom Live. All rights reserved.

**Last Updated:** March 2026  
**Version:** 1.0.0 (Submission Ready)
