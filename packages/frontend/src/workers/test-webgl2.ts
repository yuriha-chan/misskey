const canvas = new OffscreenCanvas(1, 1);
const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
if (gl) {
    postMessage({ result: true });
} else {
    postMessage({ result: false });
}
