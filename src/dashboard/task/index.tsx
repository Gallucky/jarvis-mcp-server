import { createRoot } from 'react-dom/client';
import './task.css';
import { Task } from './components/Task';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Task />);
}
