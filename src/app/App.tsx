import { Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './Landing';
import { Shell } from './Shell';
import { UpdateToast } from './UpdateToast';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/*" element={<Shell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
