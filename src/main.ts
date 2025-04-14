import Stats from 'three/addons/libs/stats.module.js'
import Experience from './Experience';
import { Clock } from 'three';
import Loading from './Loading';

// const stats = new Stats();
// document.body.appendChild(stats.dom);

const clock = new Clock();

const loading = new Loading()
const experience = new Experience(loading)

function startGame()
{
  function update() {
    const delta = clock.getDelta();
    requestAnimationFrame(update);
    
    // stats.update();
    experience.update(delta);
  }
  
  update();
}

loading.start(startGame)
