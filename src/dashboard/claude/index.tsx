import { createRoot } from 'react-dom/client';
import './claude.css';
import { ClaudeApp } from './components/ClaudeApp';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<ClaudeApp />);
}
