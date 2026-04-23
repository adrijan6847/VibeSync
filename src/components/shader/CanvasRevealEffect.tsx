'use client';

/**
 * Dot-matrix reveal shader. Dots fade in from the center (forward) or
 * out toward the edges (reverse). Used as the signature backdrop on the
 * host sync gate — ice-blue by default to match the VibeSync palette.
 *
 * Each mount runs its own GPU clock, so to switch direction you unmount
 * the forward instance and mount a reverse instance rather than flipping
 * a prop in place.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// three r183 deprecated THREE.Clock in favor of THREE.Timer, which spams
// the dev console each time R3F instantiates its internal Clock (once per
// Canvas mount). Our own code uses Timer — this filter silences only that
// specific deprecation while leaving every other three.js message on the
// native console. Keep until @react-three/fiber migrates upstream.
if (typeof window !== 'undefined') {
  THREE.setConsoleFunction((type, message, ...params) => {
    if (
      typeof message === 'string' &&
      message.startsWith('THREE.Clock: This module has been deprecated.')
    ) {
      return;
    }
    const fn = (console as unknown as Record<string, (...a: unknown[]) => void>)[type];
    if (typeof fn === 'function') fn(message, ...params);
    else console.log(message, ...params);
  });
}

type UniformDef = {
  value: number | number[] | number[][];
  type: 'uniform1f' | 'uniform1i' | 'uniform1fv' | 'uniform3fv';
};
type Uniforms = Record<string, UniformDef>;

interface CanvasRevealEffectProps {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}

export function CanvasRevealEffect({
  animationSpeed = 3,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [
    [158, 201, 255],
    [188, 220, 255],
  ],
  containerClassName,
  dotSize = 3,
  showGradient = true,
  reverse = false,
}: CanvasRevealEffectProps) {
  return (
    <div className={`relative h-full w-full ${containerClassName ?? ''}`}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors}
          dotSize={dotSize}
          opacities={opacities}
          reverse={reverse}
          animationSpeed={animationSpeed}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
}

interface DotMatrixProps {
  colors: number[][];
  opacities: number[];
  totalSize?: number;
  dotSize: number;
  reverse: boolean;
  animationSpeed: number;
}

function DotMatrix({
  colors,
  opacities,
  totalSize = 20,
  dotSize,
  reverse,
  animationSpeed,
}: DotMatrixProps) {
  const uniforms: Uniforms = useMemo(() => {
    let palette = Array.from({ length: 6 }, () => colors[0]);
    if (colors.length === 2) {
      palette = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    } else if (colors.length >= 3) {
      palette = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    }
    return {
      u_colors: {
        value: palette.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255]),
        type: 'uniform3fv',
      },
      u_opacities: { value: opacities, type: 'uniform1fv' },
      u_total_size: { value: totalSize, type: 'uniform1f' },
      u_dot_size: { value: dotSize, type: 'uniform1f' },
      u_reverse: { value: reverse ? 1 : 0, type: 'uniform1i' },
      u_anim_speed: { value: animationSpeed * 0.1, type: 'uniform1f' },
    };
  }, [colors, opacities, totalSize, dotSize, reverse, animationSpeed]);

  const fragmentShader = `
    precision mediump float;
    in vec2 fragCoord;
    uniform float u_time;
    uniform float u_opacities[10];
    uniform vec3 u_colors[6];
    uniform float u_total_size;
    uniform float u_dot_size;
    uniform vec2 u_resolution;
    uniform int u_reverse;
    uniform float u_anim_speed;
    out vec4 fragColor;

    float PHI = 1.61803398874989484820459;
    float rand(vec2 xy) {
      return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
    }

    void main() {
      vec2 st = fragCoord.xy;
      st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
      st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

      float opacity = step(0.0, st.x) * step(0.0, st.y);

      vec2 cell = vec2(int(st.x / u_total_size), int(st.y / u_total_size));
      float frequency = 5.0;
      float show_offset = rand(cell);
      float flicker = rand(cell * floor((u_time / frequency) + show_offset + frequency));
      opacity *= u_opacities[int(flicker * 10.0)];
      opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
      opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

      vec3 color = u_colors[int(show_offset * 6.0)];

      vec2 center_grid = u_resolution / 2.0 / u_total_size;
      float dist_from_center = distance(center_grid, cell);
      float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
      float t = u_time * u_anim_speed;

      if (u_reverse == 1) {
        float offset = (max_grid_dist - dist_from_center) * 0.02 + (rand(cell + 42.0) * 0.2);
        opacity *= 1.0 - step(offset, t);
        opacity *= clamp((step(offset + 0.1, t)) * 1.25, 1.0, 1.25);
      } else {
        float offset = dist_from_center * 0.01 + (rand(cell) * 0.15);
        opacity *= step(offset, t);
        opacity *= clamp((1.0 - step(offset + 0.1, t)) * 1.25, 1.0, 1.25);
      }

      fragColor = vec4(color, opacity);
      fragColor.rgb *= fragColor.a;
    }
  `;

  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMesh source={fragmentShader} uniforms={uniforms} />
    </Canvas>
  );
}

function ShaderMesh({ source, uniforms }: { source: string; uniforms: Uniforms }) {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);
  // THREE.Timer is the r183+ replacement for THREE.Clock (Clock's
  // constructor emits a deprecation warning). Timer.update() advances
  // internal state once per frame, then getElapsed() returns seconds.
  const timer = useMemo(() => new THREE.Timer(), []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    timer.update();
    const mat = mesh.material as THREE.ShaderMaterial;
    mat.uniforms.u_time.value = timer.getElapsed();
  });

  const material = useMemo(() => {
    const prepared: Record<string, THREE.IUniform> = {};
    for (const name in uniforms) {
      const u = uniforms[name];
      if (u.type === 'uniform3fv') {
        prepared[name] = {
          value: (u.value as number[][]).map(
            (v) => new THREE.Vector3(v[0], v[1], v[2]),
          ),
        };
      } else {
        prepared[name] = { value: u.value };
      }
    }
    prepared.u_time = { value: 0 };
    prepared.u_resolution = {
      value: new THREE.Vector2(size.width * 2, size.height * 2),
    };

    return new THREE.ShaderMaterial({
      vertexShader: `
        precision mediump float;
        in vec2 coordinates;
        uniform vec2 u_resolution;
        out vec2 fragCoord;
        void main() {
          gl_Position = vec4(position.xy, 0.0, 1.0);
          fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
          fragCoord.y = u_resolution.y - fragCoord.y;
        }
      `,
      fragmentShader: source,
      uniforms: prepared,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });
    // uniforms object identity is unstable; material is rebuilt only on
    // size/source changes, matching the reference implementation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, source]);

  return (
    <mesh ref={ref}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
