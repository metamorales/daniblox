import './ui/tokens.css';
import { hasWebGL2 } from './app/capability';

function showFallback(): void {
  document.getElementById('app')?.setAttribute('hidden', '');
  document.getElementById('webgl-fallback')?.removeAttribute('hidden');
}

if (hasWebGL2()) {
  // Dynamic so that Three.js lands in its own chunk and is never fetched when
  // the fallback screen is what the visitor gets.
  void import('./app/bootstrap')
    .then((module) => module.start())
    .catch((error: unknown) => {
      console.error('Daniblox failed to start', error);
      showFallback();
    });
} else {
  showFallback();
}
