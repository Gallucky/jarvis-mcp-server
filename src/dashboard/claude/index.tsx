import { createRoot } from 'react-dom/client';
import './claude.css';
import { ClaudeDashboard } from './components/ClaudeDashboard';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<ClaudeDashboard />);
}
