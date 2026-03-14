import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage/LandingPage';
import ClassroomPage from './pages/ClassroomPage/ClassroomPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/classroom" element={<ClassroomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
