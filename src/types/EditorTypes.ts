import { Vector3, Euler } from 'three';

export interface SceneObjectUpdate {
    uuid: string;
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    name: string
}

export interface ItemConfig {
    uuid: string; 
    name: string;
    path: string;
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    isCollider: boolean;
}