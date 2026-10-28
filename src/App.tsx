import { Navigate, Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar';
import OfflineNotice from './components/OfflineNotice';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';

export default function App() {
  return (
    <div className="app">
      <NavBar />
      <OfflineNotice />
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
