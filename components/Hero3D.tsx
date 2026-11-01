"use client";

import { useEffect, useRef } from "react";

const LAVENDER = 0xc4b5ec;
const PLATINUM = 0xe5e4e2;
const SILVER = 0xc0c0c0;
const MOCHA = 0xa47864;
const BLOCKS = 14;

/**
 * Full-screen three.js scene behind the home page: a faceted lavender "lens" crystal in a
 * silver wireframe shell, a chain of mocha/platinum blocks in orbit, a scanning ring and
 * drifting particles. Follows the pointer and scroll; scans faster while an audit runs.
 * three.js is imported inside the effect so it stays out of the server bundle.
 */
export function Hero3D({ busy }: { busy: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]).then(([THREE, { RoomEnvironment }]) => {
      const el = host.current;
      if (disposed || !el) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        return; // no WebGL: the CSS background still looks fine
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      // Soft studio reflections so the metal blocks and the crystal catch light.
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      scene.fog = new THREE.Fog(0x1b1411, 9, 22);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 9);

      // Lights: platinum key, lavender rim, warm mocha fill.
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(PLATINUM, 2.2);
      key.position.set(4, 5, 6);
      scene.add(key);
      const rim = new THREE.PointLight(LAVENDER, 60, 30);
      rim.position.set(-5, 2, 3);
      scene.add(rim);
      const warm = new THREE.PointLight(MOCHA, 45, 30);
      warm.position.set(5, -3, 2);
      scene.add(warm);

      const world = new THREE.Group();
      scene.add(world);

      // The lens: faceted crystal + glowing core + wireframe shell.
      const crystal = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.35, 0),
        new THREE.MeshPhysicalMaterial({
          color: LAVENDER,
          metalness: 0.25,
          roughness: 0.12,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.7,
          iridescenceIOR: 1.4,
          flatShading: true,
          transparent: true,
          opacity: 0.92,
        }),
      );
      world.add(crystal);

      const coreMat = new THREE.MeshBasicMaterial({ color: LAVENDER, wireframe: true, transparent: true, opacity: 0.55 });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), coreMat);
      world.add(core);

      const shell = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.15, 1)),
        new THREE.LineBasicMaterial({ color: SILVER, transparent: true, opacity: 0.22 }),
      );
      world.add(shell);

      // Scan ring that sweeps through the lens.
      const ringMat = new THREE.MeshBasicMaterial({ color: LAVENDER, transparent: true, opacity: 0.85 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.014, 8, 160), ringMat);
      ring.rotation.x = Math.PI / 2 - 0.42; // tipped toward the camera so it reads as a ring
      world.add(ring);
      const haloMat = new THREE.MeshBasicMaterial({ color: LAVENDER, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 2.35, 64), haloMat);
      halo.rotation.x = Math.PI / 2 - 0.42;
      world.add(halo);

      // Orbiting chain of blocks.
      const orbit = new THREE.Group();
      orbit.rotation.set(0.45, 0, -0.25);
      world.add(orbit);
      const blocks: InstanceType<typeof THREE.Mesh>[] = [];
      const boxGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      for (let i = 0; i < BLOCKS; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? PLATINUM : i % 3 === 1 ? MOCHA : 0x6a5a50,
          metalness: 0.85,
          roughness: 0.28,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.userData.phase = (i / BLOCKS) * Math.PI * 2;
        b.userData.spin = 0.4 + Math.random() * 0.8;
        orbit.add(b);
        blocks.push(b);
      }
      const chainGeo = new THREE.BufferGeometry();
      chainGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BLOCKS * 3), 3));
      const chain = new THREE.LineLoop(chainGeo, new THREE.LineBasicMaterial({ color: SILVER, transparent: true, opacity: 0.35 }));
      orbit.add(chain);

      // Particle field.
      const count = 900;
      const pts = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 4 + Math.random() * 9;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pts.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3);
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      const dust = new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({ color: PLATINUM, size: 0.035, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      scene.add(dust);

      // Layout: lens sits to the right on wide screens, centred and smaller on phones.
      const layout = { x: 0, y: 0, scale: 1, wide: true };
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Fit the lens and its orbit into the space right of the hero text (content column is
        // max-w-6xl, text max-w-xl). On narrow screens it sits behind the text, dimmed.
        const ppu = h / (2 * Math.tan((camera.fov * Math.PI) / 360) * 9); // px per world unit at z=0
        const textRight = Math.max(16, (w - 1152) / 2 + 16) + 590;
        const free = w - textRight;
        layout.wide = free > 380;
        if (layout.wide) {
          layout.x = (textRight + free / 2 - w / 2) / ppu;
          layout.y = 0.15;
          layout.scale = Math.min(1.05, (free * 0.84) / (2 * 3.6 * ppu));
        } else {
          layout.x = 0;
          layout.y = 1.4;
          layout.scale = Math.min(0.75, (w * 0.9) / (2 * 3.6 * ppu));
        }
        world.position.set(layout.x, layout.y, 0);
        world.scale.setScalar(layout.scale);
        renderer.render(scene, camera); // keeps the still (reduced-motion) frame correct
      };
      resize();
      window.addEventListener("resize", resize);

      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onMove);

      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      let speed = 1;
      let raf = 0;

      const frame = () => {
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        speed += ((busyRef.current ? 3.2 : 1) - speed) * 0.04; // ease into "scan mode"

        crystal.rotation.y += dt * 0.35 * speed;
        crystal.rotation.x += dt * 0.12 * speed;
        core.rotation.y -= dt * 0.9 * speed;
        core.scale.setScalar(1 + Math.sin(t * 2.2 * speed) * 0.06);
        coreMat.opacity = 0.45 + (busyRef.current ? 0.35 : 0.1) * (0.5 + 0.5 * Math.sin(t * 4));
        shell.rotation.y -= dt * 0.08 * speed;
        shell.rotation.z += dt * 0.04;

        const sweep = Math.sin(t * 0.9 * speed) * 1.6;
        ring.position.y = sweep;
        halo.position.y = sweep;
        const s = Math.sqrt(Math.max(0.05, 1 - (sweep / 2.4) ** 2));
        ring.scale.setScalar(s);
        halo.scale.setScalar(s);
        ringMat.opacity = busyRef.current ? 1 : 0.7;
        haloMat.opacity = busyRef.current ? 0.16 : 0.07;

        const pos = chainGeo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
        blocks.forEach((b, i) => {
          const a = b.userData.phase + t * 0.25 * speed;
          const r = 3.3 + Math.sin(t * 0.8 + i) * 0.12;
          b.position.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 0.25, Math.sin(a) * r);
          b.rotation.x += dt * b.userData.spin;
          b.rotation.y += dt * b.userData.spin * 0.7;
          pos.setXYZ(i, b.position.x, b.position.y, b.position.z);
        });
        pos.needsUpdate = true;

        dust.rotation.y += dt * 0.015;
        dust.rotation.x += dt * 0.004;

        // Pointer parallax and scroll depth.
        const scroll = Math.min(window.scrollY / window.innerHeight, 1.5);
        world.rotation.y += (pointer.x * 0.35 - world.rotation.y) * 0.05;
        world.rotation.x += (pointer.y * 0.25 + scroll * 0.4 - world.rotation.x) * 0.05;
        camera.position.z += (9 + scroll * 3 - camera.position.z) * 0.06;
        // Past the hero the scene drifts up and fades to a backdrop, so text stays readable.
        world.position.y += (layout.y + scroll * 1.8 - world.position.y) * 0.08;
        el.style.opacity = String((layout.wide ? 1 : 0.55) * (1 - Math.min(scroll, 1) * 0.72));
        camera.position.x += (pointer.x * 0.4 - camera.position.x) * 0.04;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        if (!still) raf = requestAnimationFrame(frame);
      };
      frame();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onMove);
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          const mat = m.material as InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[] | undefined;
          (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
        });
        scene.environment?.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div ref={host} className="absolute inset-0 [&>canvas]:h-full [&>canvas]:w-full" />
      {/* Fade the scene into the page as you scroll down. */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-mocha-950/90" />
    </div>
  );
}
