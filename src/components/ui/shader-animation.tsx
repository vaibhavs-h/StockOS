"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float progress;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        
        // PHASE 1: Your exact Light Beam logic (Speed boosted)
        float t_beams = time * 0.15;
        float lineWidth = 0.002;
        vec3 beamsColor = vec3(0.0);
        for(int j = 0; j < 3; j++){
          for(int i = 0; i < 5; i++){
            beamsColor[j] += lineWidth * float(i * i) / abs(fract(t_beams - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
          }
        }

        // Fade out the entire intro shader to reveal the global HeroWave behind it
        float visibility = 1.0 - smoothstep(0.5, 1.0, progress);
        
        gl_FragColor = vec4(beamsColor, visibility);
      }
    `

    const camera = new THREE.Camera()
    camera.position.z = 1
    const scene = new THREE.Scene()
    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms = {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      progress: { value: 0.0 }
    }
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const onWindowResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      renderer.setSize(width, height)
      uniforms.resolution.value.set(width * window.devicePixelRatio, height * window.devicePixelRatio)
    }
    onWindowResize()
    window.addEventListener("resize", onWindowResize, false)

    const startTime = performance.now()
    const duration = 5000
    const delay = 2500
    let animationId: number

    const animate = (now: number) => {
      const elapsed = now - startTime
      uniforms.time.value = elapsed / 1000.0
      const p = Math.max(0, (elapsed - delay) / (duration - delay))
      uniforms.progress.value = Math.min(p, 1.0)
      renderer.render(scene, camera)
      animationId = requestAnimationFrame(animate)
    }
    animationId = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("resize", onWindowResize)
      cancelAnimationFrame(animationId)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
