import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  Bounds,
  ContactShadows,
  Grid,
  Html,
  OrbitControls,
} from '@react-three/drei'
import { BoxGeometry, EdgesGeometry } from 'three'
import type { Equipment, PlacedBox } from '../types'
import { mmToM } from '../lib/packer'

export type SceneVehicle = {
  label: string
  placed: PlacedBox[]
}

type Props = {
  equipment: Equipment
  /** One or more trucks — all shown side-by-side */
  vehicles: SceneVehicle[]
  activeIndex?: number
}

function EquipmentShell({ equipment }: { equipment: Equipment }) {
  const L = mmToM(equipment.lengthMm)
  const W = mmToM(equipment.widthMm)
  const H = mmToM(equipment.heightMm)
  const cx = L / 2
  const cy = W / 2

  return (
    <group position={[-cx, 0, -cy]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cy]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#4b5563" roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh position={[cx, H / 2, cy]}>
        <boxGeometry args={[L, H, W]} />
        <meshBasicMaterial color="#E11D48" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh position={[L, H / 2, cy]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#94a3b8" transparent opacity={0.15} side={2} />
      </mesh>
      <mesh position={[0.02, H / 2, cy]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.18} side={2} />
      </mesh>
    </group>
  )
}

function BoxWithEdges({
  l,
  h,
  w,
  color,
  dimmed,
}: {
  l: number
  h: number
  w: number
  color: string
  dimmed?: boolean
}) {
  const { geo, edges } = useMemo(() => {
    const geo = new BoxGeometry(l, h, w)
    const edges = new EdgesGeometry(geo)
    return { geo, edges }
  }, [l, h, w])

  return (
    <>
      <mesh castShadow receiveShadow geometry={geo}>
        <meshStandardMaterial
          color={color}
          roughness={0.42}
          metalness={0.08}
          transparent={dimmed}
          opacity={dimmed ? 0.45 : 1}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color="#0f172a"
          transparent
          opacity={dimmed ? 0.25 : 0.65}
        />
      </lineSegments>
    </>
  )
}

function CargoLayer({
  equipment,
  placed,
  dimmed,
}: {
  equipment: Equipment
  placed: PlacedBox[]
  dimmed?: boolean
}) {
  const L = mmToM(equipment.lengthMm)
  const W = mmToM(equipment.widthMm)
  const cx = L / 2
  const cy = W / 2

  return (
    <group position={[-cx, 0, -cy]}>
      {placed.map((box, i) => {
        const l = mmToM(box.lengthMm)
        const w = mmToM(box.widthMm)
        const h = mmToM(box.heightMm)
        const x = mmToM(box.x) + l / 2
        const y = mmToM(box.z) + h / 2
        const z = mmToM(box.y) + w / 2
        return (
          <group
            key={`${box.cargoId}-${box.itemIndex}-${i}`}
            position={[x, y, z]}
          >
            <BoxWithEdges
              l={l}
              h={h}
              w={w}
              color={box.color}
              dimmed={dimmed}
            />
          </group>
        )
      })}
    </group>
  )
}

function TruckUnit({
  equipment,
  vehicle,
  active,
}: {
  equipment: Equipment
  vehicle: SceneVehicle
  active: boolean
}) {
  const H = mmToM(equipment.heightMm)
  return (
    <group>
      <Html position={[0, H + 0.35, 0]} center distanceFactor={14}>
        <div className={active ? 'scene-truck-label active' : 'scene-truck-label'}>
          {vehicle.label}
        </div>
      </Html>
      <EquipmentShell equipment={equipment} />
      <CargoLayer
        equipment={equipment}
        placed={vehicle.placed}
        dimmed={!active}
      />
    </group>
  )
}

export function LoadScene({ equipment, vehicles, activeIndex = 0 }: Props) {
  const W = mmToM(equipment.widthMm)
  const gap = W + 2.2
  const list = vehicles.length ? vehicles : [{ label: 'Bil 1', placed: [] }]

  return (
    <Canvas
      shadows
      camera={{ position: [22, 14, 22], fov: 40, near: 0.1, far: 400 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0f172a']} />
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow
        position={[14, 22, 10]}
        intensity={1.2}
        shadow-mapSize={[2048, 2048]}
      />
      <hemisphereLight args={['#e2e8f0', '#334155', 0.4]} />

      <Bounds fit clip observe margin={1.25}>
        <group>
          {list.map((v, i) => (
            <group key={v.label} position={[0, 0, (i - (list.length - 1) / 2) * gap]}>
              <TruckUnit
                equipment={equipment}
                vehicle={v}
                active={i === activeIndex}
              />
            </group>
          ))}
        </group>
      </Bounds>

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.4}
        scale={60}
        blur={2.5}
        far={24}
      />
      <Grid
        infiniteGrid
        fadeDistance={60}
        sectionColor="#3d4450"
        cellColor="#2a2e38"
        position={[0, -0.02, 0]}
      />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}
