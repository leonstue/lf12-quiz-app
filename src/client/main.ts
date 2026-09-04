import { mount } from 'svelte';

import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Mount-Ziel #app wurde nicht gefunden.');
}

export default mount(App, { target });
