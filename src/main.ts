import Stats from 'three/addons/libs/stats.module.js'
import Experience from './Experience';
import { Clock } from 'three';

const stats = new Stats();
document.body.appendChild(stats.dom);

const clock = new Clock();

const experience = new Experience()

function update() {
  const delta = clock.getDelta();
  requestAnimationFrame(update);
  
  stats.update();
  experience.update(delta);
}

update();
