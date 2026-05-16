import { useEffect, useRef, useState, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  size: number
  color: string
  alpha: number
  targetAlpha: number
  vx: number
  vy: number
  friction: number
  springStrength: number
}

const COLORS = [
  '100,160,75',
  '120,175,90',
  '85,145,65',
  '140,195,110',
  '75,130,58',
  '160,200,130',
  '110,155,85',
  '130,185,105',
  '90,150,70',
  '150,205,125',
]

function pickColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

interface ParticleTextCanvasProps {
  line1: string
  line2: string
  className?: string
}

export function ParticleTextCanvas({ line1, line2, className }: ParticleTextCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number>(0)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  const buildTargetPositions = useCallback(
    (canvas: HTMLCanvasElement, l1: string, l2: string): { positions: { x: number; y: number }[]; pixelStep: number } => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return { positions: [], pixelStep: 2 }

      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      const hasLine2 = l2 && l2.length > 0
      const font1Size = Math.min(w * 0.85 / (l1.length * 0.58 + 0.5), h * (hasLine2 ? 0.35 : 0.55), 280)
      ctx.font = `900 ${font1Size}px "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000'

      const font2Size = hasLine2 ? font1Size * 0.3 : 0
      const lineGap = hasLine2 ? font1Size * 0.3 : 0

      const topY = hasLine2 ? h / 2 - lineGap : h / 2
      ctx.fillText(l1, w / 2, topY)

      if (hasLine2 && font2Size >= 12) {
        ctx.font = `700 ${font2Size}px "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif`
        ctx.fillText(l2, w / 2, h / 2 + lineGap + font1Size * 0.1)
      }

      ctx.restore()

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const positions: { x: number; y: number }[] = []

      const step = 5
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const idx = (y * canvas.width + x) * 4
          if (data[idx + 3] > 100) {
            positions.push({ x: x / dpr, y: y / dpr })
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return { positions, pixelStep: step }
    },
    []
  )

  // 监听容器尺寸变化 → 更新 canvas 物理尺寸 + 触发重建
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1

    const sync = (): void => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      canvas.width = w * dpr
      canvas.height = h * dpr
      setCanvasSize({ w, h })
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // 文字或尺寸变化 → 重建粒子目标位置
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !line1 || canvasSize.w === 0) return

    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { positions: targets, pixelStep } = buildTargetPositions(canvas, line1, line2)
    if (targets.length === 0) return

    const w = canvasSize.w
    const h = canvasSize.h
    const current = particlesRef.current
    const next: Particle[] = []
    const baseSize = pixelStep * 0.52

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      const color = pickColor()

      if (i < current.length) {
        const p = current[i]
        p.baseX = t.x
        p.baseY = t.y
        p.targetAlpha = 0.7 + Math.random() * 0.3
        p.color = color
        p.size = baseSize + Math.random() * 0.8
        next.push(p)
      } else {
        next.push({
          x: t.x + (Math.random() - 0.5) * w * 0.6,
          y: t.y + (Math.random() - 0.5) * h * 0.6,
          baseX: t.x,
          baseY: t.y,
          size: baseSize + Math.random() * 0.8,
          color,
          alpha: 0,
          targetAlpha: 0.7 + Math.random() * 0.3,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          friction: 0.9 + Math.random() * 0.05,
          springStrength: 0.025 + Math.random() * 0.035
        })
      }
    }

    for (let i = targets.length; i < current.length; i++) {
      const p = current[i]
      p.targetAlpha = 0
      p.baseX = p.x + (Math.random() - 0.5) * 300
      p.baseY = p.y + (Math.random() - 0.5) * 300
      next.push(p)
    }

    particlesRef.current = next

    // 动画循环
    let lastTime = performance.now()
    let frame = 0

    const animate = (now: number): void => {
      const dt = Math.min((now - lastTime) / 16.67, 3)
      lastTime = now
      frame++

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      const particles = particlesRef.current

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]

        const dx = p.baseX - p.x
        const dy = p.baseY - p.y
        p.vx += dx * p.springStrength * dt
        p.vy += dy * p.springStrength * dt

        const breath = frame * 0.006 + i * 0.2
        p.vx += Math.sin(breath) * 0.02 * dt
        p.vy += Math.cos(breath * 0.7) * 0.02 * dt

        p.vx *= p.friction
        p.vy *= p.friction
        p.x += p.vx * dt
        p.y += p.vy * dt

        p.alpha += (p.targetAlpha - p.alpha) * 0.06 * dt

        if (p.targetAlpha === 0 && p.alpha < 0.01) {
          particles.splice(i, 1)
          continue
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color},${p.alpha.toFixed(2)})`
        ctx.fill()
      }

      ctx.restore()
      animFrameRef.current = requestAnimationFrame(animate)
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [line1, line2, canvasSize.w, canvasSize.h, buildTargetPositions])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
