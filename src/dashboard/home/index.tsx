import { createRoot } from 'react-dom/client';
import './home.css';
import { Home } from './components/Home';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Home />);
}
