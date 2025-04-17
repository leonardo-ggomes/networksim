import { AnimationAction, AnimationClip, AnimationMixer, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PointLight, Quaternion, RingGeometry, SkinnedMesh, SpotLight, Vector3 } from 'three'
import Loading from './Loading'
import { colliders } from './Colliders'

export default class Guest {


    static animationsAction: { [key: string]: AnimationAction } = {}
    static models: { [key: string]: { 
        mixer: AnimationMixer, 
        obj: Object3D,
        activeClip: AnimationAction
    } } = {}
  

    static async loadModel(loading: Loading, urlAvatar: string, socketId: string) {
 
        return await new Promise<void>((resolve) => {
           
            loading.loader.load(urlAvatar, async (models) => {

                Guest.models[socketId] = {} as any;

                Guest.models[socketId].obj = models.scene
    
    
                Guest.models[socketId].mixer = new AnimationMixer(models.scene)
    
                for (let animationKey in loading.globalAnimations) {
                    Guest.animationsAction[animationKey] = Guest.models[socketId].mixer.clipAction(loading.globalAnimations[animationKey])
                }
    
                Guest.animationsAction["Idle"].play()
    
                Guest.models[socketId].obj.name = `guest.${socketId}`
                colliders.push(Guest.models[socketId].obj)

                resolve()
            })

        })
      

    }

    static setPosition(newPosition: Vector3, socketId: string) {
        Guest.models[socketId].obj.position.copy(newPosition)
    }

    static setQuaternion(newQuaternion: Quaternion, socketId: string) {
        Guest.models[socketId].obj.quaternion.copy(newQuaternion)
    }

    static setAnimation(action?: AnimationAction, socketId: string = "") {
        if (action !=  Guest.models[socketId].activeClip) {
            if (action) {
                switch (action) {
                    case Guest.animationsAction["Sitting"]:
                        Guest.models[socketId].activeClip.fadeOut(0);
                        action.reset().play();
                        break;
                    default:

                        if (Guest.models[socketId].activeClip == Guest.animationsAction["Sitting"]) {
                            Guest.models[socketId].activeClip.fadeOut(0);
                        }
                        else if(Guest.models[socketId].activeClip){
                            Guest.models[socketId].activeClip.fadeOut(0.2);
                        }

                        action?.reset().fadeIn(0.1).play();
                }

                Guest.models[socketId].activeClip = action;
            }

        }
    }

    static update(delta: number) {
        
        Object.keys(Guest.models).forEach((guest) => { 

            const model = Guest.models[guest]
            model.mixer.update(delta)

            const anims = model.obj.getObjectByName("Hips")

            if (anims) {
                anims.position.set(0, anims.position.y, 0)
            }

            if (Guest.models[guest].activeClip == Guest.animationsAction["Sitting"]) {
                if (anims) {
                    anims.rotation.x = 0
                    anims.position.set(0, anims.position.y + 0.5, 0)
                }
            }


        })
    }
}