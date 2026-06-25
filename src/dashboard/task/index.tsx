import { createRoot } from 'react-dom/client';
import './task.css';
import { TasksScreen } from './components/Task';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<TasksScreen />);
}
