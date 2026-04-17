"use client"

import { Canvas } from "@react-three/fiber"
import { ShaderPlane } from "./VibeShader"

export function ThreeBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-80">
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }} dpr={[1, 2]}>
        <ShaderPlane />
      </Canvas>
    </div>
  )
}
