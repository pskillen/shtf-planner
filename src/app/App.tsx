import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { UpdateToast } from './UpdateToast';

export function App() {
  return (
    <>
      <Routes>
        {/* Slice 3 puts the landing page at "/". */}
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app/*" element={<Shell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
