// Tiled, multi-pass WebGL2 renderer. A heavy fragment shader is drawn a tile at a
// time into a float framebuffer, several jittered passes are averaged for
// anti-aliasing, and the result comes back as linear float RGB for post work in JS.
(function () {
  const VERT = `#version 300 es
  in vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      console.error(log + '\n' + lines.slice(0, 200));
      throw new Error('shader compile failed: ' + log);
    }
    return s;
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  P.glRender = async function ({ frag, width, height, uniforms = {}, arrays = {}, passes = 4, tile = 200, label = 'rendering', onPass, channels = 3 }) {
    const cv = document.createElement('canvas');
    cv.width = width; cv.height = height;
    const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets unavailable');

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, width, height);

    const u = (name) => gl.getUniformLocation(prog, name);
    gl.uniform2f(u('uRes'), width, height);
    for (const [k, v] of Object.entries(uniforms)) {
      const l = u(k);
      if (l === null) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    for (const [k, v] of Object.entries(arrays)) {
      const l = u(k + '[0]') || u(k);
      if (l !== null) gl.uniform4fv(l, v);
    }
    const uJ = u('uJitter'), uPass = u('uPass');

    const C = channels;
    const acc = new Float32Array(width * height * C);
    const px = new Float32Array(width * height * 4);
    const probe = new Float32Array(4);
    const tilesX = Math.ceil(width / tile), tilesY = Math.ceil(height / tile);
    const total = tilesX * tilesY * passes;
    let done = 0;

    // low-discrepancy (R2) sub-pixel offsets, one per pass
    const g = 1.32471795724474602596;
    const jit = Array.from({ length: passes }, (_, i) => [((0.5 + (i + 1) / g) % 1) - 0.5, ((0.5 + (i + 1) / (g * g)) % 1) - 0.5]);

    gl.enable(gl.SCISSOR_TEST);
    for (let p = 0; p < passes; p++) {
      const j = passes === 1 ? [0, 0] : jit[p];
      gl.uniform2f(uJ, j[0], j[1]);
      if (uPass) gl.uniform1f(uPass, p);
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          gl.scissor(tx * tile, ty * tile, tile, tile);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          done++;
        }
        // force completion of this row before queueing more work
        gl.readPixels(0, ty * tile, 1, 1, gl.RGBA, gl.FLOAT, probe);
        P.progress(done / total, label);
        await nextFrame();
      }
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, px);
      if (gl.isContextLost()) throw new Error('WebGL context was lost (GPU timeout?)');
      // GL rows are bottom-up; flip into top-down order while accumulating
      for (let y = 0; y < height; y++) {
        const src = (height - 1 - y) * width * 4, dst = y * width * C;
        for (let x = 0; x < width; x++) {
          for (let c = 0; c < C; c++) acc[dst + x * C + c] += px[src + x * 4 + c];
        }
      }
      if (onPass) onPass(acc, p + 1);
    }
    const inv = 1 / passes;
    for (let i = 0; i < acc.length; i++) acc[i] *= inv;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return acc;
  };

  // ACES filmic fit (Narkowicz)
  P.aces = (x) => {
    const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };
})();
