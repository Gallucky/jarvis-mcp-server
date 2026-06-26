import { createRoot } from 'react-dom/client';
import './task.css';
import './styles/searchbar.css';
import { TasksScreen } from './components/TasksScreen';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<TasksScreen />);
}
