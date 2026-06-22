import { createRoot } from 'react-dom/client';
import './study.css';
import { Study } from './components/Study';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Study />);
}
