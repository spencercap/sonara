/*
 * Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



 // spatial audio 

 // Audio scene globals
 let audioContext = new AudioContext();
 // audioContext.state == 'running';
 let resonance = new ResonanceAudio(audioContext);
 resonance.output.connect(audioContext.destination);
 audioContext.suspend();
 // const DEFAULT_HEIGHT = 1.5; // og 
 const DEFAULT_HEIGHT = 0; 
 const ANALYSER_FFT_SIZE = 1024;

 let audioSources = [];






// const MODEL_OBJ_URL = './assets/ArcticFox_Posed.obj';
// const MODEL_MTL_URL = './assets/ArcticFox_Posed.mtl';
const MODEL_OBJ_URL = './assets/stereo-big/hifiStereo.obj';
const MODEL_MTL_URL = './assets/stereo-big/hifiStereo.mtl';
const MODEL_GLTF_URL = './assets/stereo/stereo.gltf';
const MODEL_SCALE = 0.05;

/**
 * Container class to manage connecting to the WebXR Device API
 * and handle rendering on every frame.
 */
class App {
  constructor() {
    this.onXRFrame = this.onXRFrame.bind(this);
    this.onEnterAR = this.onEnterAR.bind(this);
    this.onClick = this.onClick.bind(this);

    this.init();
  }

  /**
   * Fetches the XRDevice, if available.
   */
  async init() {
    // The entry point of the WebXR Device API is on `navigator.xr`.
    // We also want to ensure that `XRSession` has `requestHitTest`,
    // indicating that the #webxr-hit-test flag is enabled.
    if (navigator.xr && XRSession.prototype.requestHitTest) {
      try {
        this.device = await navigator.xr.requestDevice();
      } catch (e) {
        // If there are no valid XRDevice's on the system,
        // `requestDevice()` rejects the promise. Catch our
        // awaited promise and display message indicating there
        // are no valid devices.
        this.onNoXRDevice();
        return;
      }


      var that = this;
      console.log('loading audio sources...');
      // Load multiple audio sources.
      Promise.all([
          createAudioSource({
              url: './assets/sound/guitar.ogg',
              position: [0, DEFAULT_HEIGHT, -1],
              rotateX: 0,
              rotateY: 0, // radians
              rotateZ: 0
          }),
          createAudioSource({
              url: './assets/sound/drums.ogg',
              position: [-1, DEFAULT_HEIGHT, 0],
              rotateX: 0,
              rotateY: Math.PI * 0.5, // radians
              rotateZ: 0
          }),
          createAudioSource({
              url: './assets/sound/perc.ogg',
              position: [1, DEFAULT_HEIGHT, 0],
              rotateX: 0,
              rotateY: Math.PI * -0.5, // radians
              rotateZ: 0
          }),
          ]).then(function(sources) {
              console.log('loaded audio sources!');
              that.audioSources = sources;
            //   console.log(that);
            //   audioSources = sources;

              // // Once the audio is loaded, create a button that toggles the
              // // audio state when clicked.
              // playButton = new ButtonNode(playTexture, function() {
              //     if (audioContext.state == 'running') {
              //     pauseAudio();
              //     } else {
              //     playAudio();
              //     }
              // });
              // // playButton.translation = [0, 1.2, -0.65]; // og 
              // playButton.translation = [0, 0, -0.65]; // y=0 is center/starting point for AR 
              // // playButton.translation = [0, 0, 0];

              // scene.addNode(playButton);
              // console.log('added play button to scene');
          });

    } else {
      // If `navigator.xr` or `XRSession.prototype.requestHitTest`
      // does not exist, we must display a message indicating there
      // are no valid devices.
      this.onNoXRDevice();
      return;
    }

    // We found an XRDevice! Bind a click listener on our "Enter AR" button
    // since the spec requires calling `device.requestSession()` within a
    // user gesture.
    document.querySelector('#enter-ar').addEventListener('click', this.onEnterAR);
  }

  /**
   * Handle a click event on the '#enter-ar' button and attempt to
   * start an XRSession.
   */
  async onEnterAR() {
    // Now that we have an XRDevice, and are responding to a user
    // gesture, we must create an XRPresentationContext on a
    // canvas element.
    const outputCanvas = document.createElement('canvas');
    const ctx = outputCanvas.getContext('xrpresent');

    try {
      // Request a session for the XRDevice with the XRPresentationContext
      // we just created.
      // Note that `device.requestSession()` must be called in response to
      // a user gesture, hence this function being a click handler.
      const session = await this.device.requestSession({
        outputContext: ctx,
        environmentIntegration: true,
      });

      // If `requestSession` is successful, add the canvas to the
      // DOM since we know it will now be used.
      document.body.appendChild(outputCanvas);
      this.onSessionStarted(session)
    } catch (e) {
      // If `requestSession` fails, the canvas is not added, and we
      // call our function for unsupported browsers.
      this.onNoXRDevice();
    }
  }

  /**
   * Toggle on a class on the page to disable the "Enter AR"
   * button and display the unsupported browser message.
   */
  onNoXRDevice() {
    document.body.classList.add('unsupported');
  }

  /**
   * Called when the XRSession has begun. Here we set up our three.js
   * renderer, scene, and camera and attach our XRWebGLLayer to the
   * XRSession and kick off the render loop.
   */
  async onSessionStarted(session) {
    this.session = session;
    this.changeSpeakerSelection = 0;

    // Add the `ar` class to our body, which will hide our 2D components
    document.body.classList.add('ar');

    // To help with working with 3D on the web, we'll use three.js. Set up
    // the WebGLRenderer, which handles rendering to our session's base layer.
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.autoClear = false;

    // We must tell the renderer that it needs to render shadows.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.gl = this.renderer.getContext();

    // Ensure that the context we want to write to is compatible
    // with our XRDevice
    await this.gl.setCompatibleXRDevice(this.session.device);

    // Set our session's baseLayer to an XRWebGLLayer
    // using our new renderer's context
    this.session.baseLayer = new XRWebGLLayer(this.session, this.gl);

    // Set the XRSession framebuffer on our three.js renderer rather
    // than using the default framebuffer -- this is necessary for things
    // in three.js that use other render targets, like shadows.
    const framebuffer = this.session.baseLayer.framebuffer;
    this.renderer.setFramebuffer(framebuffer);

    // A THREE.Scene contains the scene graph for all objects in the
    // render scene. Call our utility which gives us a THREE.Scene
    // with a few lights and surface to render our shadows. Lights need
    // to be configured in order to use shadows, see `shared/utils.js`
    // for more information.
    this.scene = DemoUtils.createLitScene();

    // console.log(this.scene);

    // Use the DemoUtils.loadModel to load our OBJ and MTL. The promise
    // resolves to a THREE.Group containing our mesh information.
    // Dont await this promise, as we want to start the rendering
    // process before this finishes.

    // var that = this; // remake this scope 
    // var loader = new THREE.GLTFLoader();
    // loader.load( MODEL_GLTF_URL, function ( gltf ) {

    //     // scene.add( gltf.scene );
    //     // console.log(this);
    //     // console.log(gltf);
    //     that.model = gltf.scene.children[2];
    //     that.model.children.forEach(mesh => mesh.castShadow = true);
    //     that.model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    //     // that.modelmesh.rotation.x = Math.PI / 2;
    //     // object.rotateY(THREE.Math.degToRad(degreeY));
    //     console.log(that);


    // }, undefined, function ( error ) { console.error( error ); } );





    var count = 0;
    // linking sources to scene 
    for (let source of this.audioSources) {
        if (!source.node) {

            DemoUtils.loadModel(MODEL_OBJ_URL, MODEL_MTL_URL).then(model => {
                this.model = model;
        
                // // Some models contain multiple meshes, so we want to make sure
                // // all of our meshes within the model case a shadow.
                this.model.children.forEach(mesh => mesh.castShadow = true);
        
                // // Every model is different -- you may have to adjust the scale
                // // of a model depending on the use.
                this.model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);   
                
                
                 // source.node = stereo.clone(); // og 
                // console.log(that.model);
                source.node = this.model;
                // console.log(source.node);
                //   source.node.visible = true;
                //   source.node.selectable = true;

                // Some models contain multiple meshes, so we want to make sure
                // all of our meshes within the model case a shadow.
                source.node.children.forEach(mesh => mesh.castShadow = true);

                // Every model is different -- you may have to adjust the scale
                // of a model depending on the use.
                source.node.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
                source.node.position.set(source.position[0], source.position[1], source.position[2]);
                source.node.lookAt(0.0, 0.0, 0.0);
                source.node.name = "test name " + count;
                // console.log(source.node);


                // make speaker 1 (index 0) green color as default selection
                if ( count == 0) {
                    source.node.children[0].material[4].color.g = 0.65;
                }
                

                this.scene.add(source.node);
                // scene.addNode(source.node);
                count++;

            });

        }
    }


    // We'll update the camera matrices directly from API, so
    // disable matrix auto updates so three.js doesn't attempt
    // to handle the matrices independently.
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;

    // Add a Reticle object, which will help us find surfaces by drawing
    // a ring shape onto found surfaces. See source code
    // of Reticle in shared/utils.js for more details.
    this.reticle = new Reticle(this.session, this.camera);
    this.scene.add(this.reticle);

    this.frameOfRef = await this.session.requestFrameOfReference('eye-level');
    this.session.requestAnimationFrame(this.onXRFrame);

    window.addEventListener('click', this.onClick);

    // console.log(this);
  }

  /**
   * Called on the XRSession's requestAnimationFrame.
   * Called with the time and XRPresentationFrame.
   */
  onXRFrame(time, frame) {
    let session = frame.session;
    let pose = frame.getDevicePose(this.frameOfRef);

    // Update the reticle's position
    this.reticle.update(this.frameOfRef);

    // If the reticle has found a hit (is visible) and we have
    // not yet marked our app as stabilized, do so
    if (this.reticle.visible && !this.stabilized) {
      this.stabilized = true;
      document.body.classList.add('stabilized');
    }

    // Queue up the next frame
    session.requestAnimationFrame(this.onXRFrame);

    // Bind the framebuffer to our baseLayer's framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.session.baseLayer.framebuffer);

     // audio 
     updateAudioNodes(this);

    if (pose) {
      // Our XRFrame has an array of views. In the VR case, we'll have
      // two views, one for each eye. In mobile AR, however, we only
      // have one view.
      for (let view of frame.views) {
        const viewport = session.baseLayer.getViewport(view);
        this.renderer.setSize(viewport.width, viewport.height);

        // Set the view matrix and projection matrix from XRDevicePose
        // and XRView onto our THREE.Camera.
        this.camera.projectionMatrix.fromArray(view.projectionMatrix);
        const viewMatrix = new THREE.Matrix4().fromArray(pose.getViewMatrix(view));
        this.camera.matrix.getInverse(viewMatrix);
        this.camera.updateMatrixWorld(true);

        // Render our scene with our THREE.WebGLRenderer
        this.renderer.render(this.scene, this.camera);
      }


      // audio 
      resonance.setListenerFromMatrix({ elements: pose.poseModelMatrix });

    }
  }

  /**
   * This method is called when tapping on the page once an XRSession
   * has started. We're going to be firing a ray from the center of
   * the screen, and if a hit is found, use it to place our object
   * at the point of collision.
   */
  async onClick(e) {
      console.log('on main click');
    // If our model is not yet loaded, abort
    if (!this.model) {
      return;
    }

    // We're going to be firing a ray from the center of the screen.
    // The requestHitTest function takes an x and y coordinate in
    // Normalized Device Coordinates, where the upper left is (-1, 1)
    // and the bottom right is (1, -1). This makes (0, 0) our center.
    const x = 0;
    const y = 0;

    // Create a THREE.Raycaster if one doesn't already exist,
    // and use it to generate an origin and direction from
    // our camera (device) using the tap coordinates.
    // Learn more about THREE.Raycaster:
    // https://threejs.org/docs/#api/core/Raycaster
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.raycaster.setFromCamera({ x, y }, this.camera);
    const ray = this.raycaster.ray;

    // Fire the hit test to see if our ray collides with a real
    // surface. Note that we must turn our THREE.Vector3 origin and
    // direction into an array of x, y, and z values. The proposal
    // for `XRSession.prototype.requestHitTest` can be found here:
    // https://github.com/immersive-web/hit-test
    const origin = new Float32Array(ray.origin.toArray());
    const direction = new Float32Array(ray.direction.toArray());
    const hits = await this.session.requestHitTest(origin,
                                                   direction,
                                                   this.frameOfRef);

    // If we found at least one hit...
    if (hits.length) {
      // We can have multiple collisions per hit test. Let's just take the
      // first hit, the nearest, for now.
      const hit = hits[0];

      // Our XRHitResult object has one property, `hitMatrix`, a
      // Float32Array(16) representing a 4x4 Matrix encoding position where
      // the ray hit an object, and the orientation has a Y-axis that corresponds
      // with the normal of the object at that location.
      // Turn this matrix into a THREE.Matrix4().
      const hitMatrix = new THREE.Matrix4().fromArray(hit.hitMatrix);

      moveSpeakerWithHitMatrix(hitMatrix, origin);

      // Now apply the position from the hitMatrix onto our model.
    //   this.model.position.setFromMatrixPosition(hitMatrix);

    //   // Rather than using the rotation encoded by the `modelMatrix`,
    //   // rotate the model to face the camera. Use this utility to
    //   // rotate the model only on the Y axis.
    // //   DemoUtils.lookAtOnY(this.model, this.camera);

    // //   this.model.rotateY(THREE.Math.degToRad(90));
    //   this.model.lookAt(0.0, 0.0, 0.0);


    //   // Now that we've found a collision from the hit test, let's use
    //   // the Y position of that hit and assume that's the floor. We created
    //   // a mesh in `DemoUtils.createLitScene()` that receives shadows, so set
    //   // it's Y position to that of the hit matrix so that shadows appear to be
    //   // cast on the ground under the model.
    // //   const shadowMesh = this.scene.children.find(c => c.name === 'shadowMesh');
    // //   shadowMesh.position.y = this.model.position.y;

    //   // Ensure our model has been added to the scene.
    //   this.scene.add(this.model);
    }
  }
};


function changeSpeakerSelection() {
    let offset = 4;
    this.app.changeSpeakerSelection = document.querySelector('#selector').value ;

    this.app.scene.children.forEach( function(child) {

        if ( child.name.includes("test name") ) {
            child.children[0].material[4].color.g = 0.08;
        }

    })

    offset += parseInt(this.app.changeSpeakerSelection);
    // console.log(offset);
    let theSpeakerChild = this.app.scene.children[ offset ];
    // console.log(theSpeakerChild);
    theSpeakerChild.children[0].material[4].color.g = 0.65;
    
    // if ( this.app.changeSpeakerSelection == '0') {
    //     this.app.scene.children[ offset ]
    // }
    // else if ( this.app.changeSpeakerSelection == '1') {

    // }
    // else if ( this.app.changeSpeakerSelection == '2') {

    // }
    // else {
    //     console.log('whaaaat?');
    // }

    
}

function updateAudioNodes(context) {
    // console.log(context);
    // console.log(audioSources);

    // console.log('audio nodes update');

    if (!context.model)
      return;

    for (let source of context.audioSources) {
      if (!source.node) {
          console.log("added source: ");
          console.log(source);

        // source.node = stereo.clone(); // og 
        source.node = context.model;
        source.node.visible = true;
        source.node.selectable = true;
        context.scene.add(source.node);
        // scene.addNode(source.node);
      }


      let speakerSelect = context.audioSources.indexOf(source) + 4;
      let scale = getLoudnessScale(source.analyser) * 0.05;
      this.app.scene.children[speakerSelect].scale.set(scale, scale, scale);
      

      let node = source.node;
      let matrix = node.matrix;
    //   console.log(source);

    //   console.log(frozenQuat);

      // Move the node to the right location.
    //   mat4.identity(matrix);
    // //   mat4.fromQuat(matrix, frozenQuat);
    //   mat4.translate(matrix, matrix, source.position);
    //   /* `mat4.translate(out, a, v)`
    //   Translate a mat4 by the given vector
    //     Parameters:
    //     Name	Type	Description
    //     out	mat4	the receiving matrix
    //     a	mat4	the matrix to translate
    //     v	vec3	vector to translate by
    //   */



    // // // didnt work
    // //   mat4.rotateX(matrix, matrix, source.rotateX);
    // //   mat4.rotateY(matrix, matrix, source.rotateY);
    // //   mat4.rotateZ(matrix, matrix, source.rotateZ);


    //   // Scale it based on loudness of the audio channel
    //   let scale = getLoudnessScale(source.analyser);
    //   mat4.scale(matrix, matrix, [scale, scale, scale]);
      
    }
  }

    function moveSpeakerWithHitMatrix(hitMatrix, origin) {
        // console.log("moveSpeakerWithHitMatrix");

        var index = parseInt(this.app.changeSpeakerSelection) + 4;
        let theSpeakerChild = this.app.scene.children[ index ];
        // console.log(theSpeakerChild);

        
        // 1. move the virtual ar object
        theSpeakerChild.position.setFromMatrixPosition(hitMatrix);
        // console.log(origin);
        theSpeakerChild.lookAt(origin[0], origin[1], origin[2]);


        // 2. move the virtual sound source 
        let tempPos = new THREE.Vector3( );
        tempPos.setFromMatrixPosition(hitMatrix);
        // console.log(tempPos);
        let thisAudioSource = this.app.audioSources[this.app.changeSpeakerSelection];
        // console.log(thisAudioSource);
        thisAudioSource.source.setPosition(tempPos.x, tempPos.y, tempPos.z );
        
        // this.app.audioSources[this.app.changeSpeakerSelection].position = [tempPos.x,  tempPos.y,  tempPos.z ];
    }

  const htmlPlayButton = document.querySelector('#htmlPlayButton');
      htmlPlayButton.addEventListener('click', function() {
          event.preventDefault();
        //   console.log('play button clicked');

        // simple play/pause toggle
          if ( this.innerHTML == "play audio") {
            playAudio();
            this.innerHTML = "pause audio";
          }
          else if ( this.innerHTML == "pause audio") {
            pauseAudio();
            this.innerHTML = "play audio";
          }
          
      });

function createAudioSource(options) {
    // Create a Resonance source and set its position in space.
    let source = resonance.createSource();
    let pos = options.position;
    source.setPosition(pos[0], pos[1], pos[2]);

    // Connect an analyser. This is only for visualization of the audio, and
    // in most cases you won't want it.
    let analyser = audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.lastRMSdB = 0;

    return fetch(options.url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((decodedBuffer) => {
        let bufferSource = createBufferSource(
          source, decodedBuffer, analyser);

        return {
          buffer: decodedBuffer,
          bufferSource: bufferSource,
          source: source,
          analyser: analyser,
          position: pos,
          rotateX: options.rotateX,
          rotateY: options.rotateY,
          rotateZ: options.rotateZ,
          matrix: null,
          model: null,
          node: null
        };
      });
  }

  function createBufferSource(source, buffer, analyser) {
    // Create a buffer source. This will need to be recreated every time
    // we wish to start the audio, see 
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
    let bufferSource = audioContext.createBufferSource();
    bufferSource.loop = true;
    bufferSource.connect(source.input);

    bufferSource.connect(analyser);

    bufferSource.buffer = buffer;

    return bufferSource;
  }



      /**
       * Returns a floating point value that represents the loudness of the audio
       * stream, appropriate for scaling an object with.
       * @return {Number} loudness scalar.
       */
      let fftBuffer = new Float32Array(ANALYSER_FFT_SIZE);
      function getLoudnessScale(analyser) {
        analyser.getFloatTimeDomainData(fftBuffer);
        let sum = 0;
        for (let i = 0; i < fftBuffer.length; ++i)
          sum += fftBuffer[i] * fftBuffer[i];

        // Calculate RMS and convert it to DB for perceptual loudness.
        let rms = Math.sqrt(sum / fftBuffer.length);
        let db = 30 + 10 / Math.LN10 * Math.log(rms <= 0 ? 0.0001 : rms);

        // Moving average with the alpha of 0.525. Experimentally determined.
        analyser.lastRMSdB += 0.525 * ((db < 0 ? 0 : db) - analyser.lastRMSdB);

        // Scaling by 1/30 is also experimentally determined. Max is to present
        // objects from disappearing entirely.
        return Math.max(0.3, analyser.lastRMSdB / 30.0);
      }


      function playAudio() {
          console.log('play audio called');
        if (audioContext.state == 'running')
          return;

        audioContext.resume();

        for (let source of this.app.audioSources) {
          source.bufferSource.start(0);
        }

        // if (playButton) {
        //   playButton.iconTexture = pauseTexture;
        // }
      }

      function pauseAudio() {
        if (audioContext.state == 'suspended')
          return;

        for (let source of this.app.audioSources) {
          source.bufferSource.stop(0);
          source.bufferSource = createBufferSource(
            source.source, source.buffer, source.analyser);
        }

        audioContext.suspend();

        // if (playButton) {
        //   playButton.iconTexture = playTexture;
        // }
      }


  window.addEventListener('blur', function() {
    // As a general rule you should mute any sounds your page is playing
    // whenever the page loses focus.
    pauseAudio();
  });

window.app = new App();
