// effects.js — tracers, muzzle flash, impact sparks, decals, explosion flash.
// All pooled and cheap: lines for tracers, point sprites for sparks.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.decals = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.sparkPoints = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc266, size: 0.22, transparent: true, opacity: 0.95 }));
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);
    this.sparkVel = [];
    this.sparkLife = [];
    this.flash = new THREE.PointLight(0xffc266, 0, 9, 1.8);
    scene.add(this.flash);
    this.flashT = 0;
  }
  tracer(from, to, color = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }
  muzzle(pos, dir) {
    this.flash.position.copy(pos).addScaledVector(dir, 0.6);
    this.flash.intensity = 26; this.flashT = 0.06;
    this.burst(pos.clone().addScaledVector(dir, 0.5), 5, 0xffd27a, 3);
  }
  burst(pos, n, color, speed = 5) {
    const attr = this.sparkPoints.geometry.attributes.position;
    for (let i = 0; i < n; i++) {
      let idx = this.sparks.findIndex(s => s.life <= 0);
      if (idx < 0) { if (this.sparks.length >= 300) return; idx = this.sparks.length; this.sparks.push({ life: 0 }); this.sparkVel.push(new THREE.Vector3()); this.sparkLife.push(0); }
      attr.setXYZ(idx, pos.x, pos.y, pos.z);
      this.sparkVel[idx].set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
      this.sparkLife[idx] = 0.35 + Math.random() * 0.25;
      this.sparks[idx].life = this.sparkLife[idx];
    }
    attr.needsUpdate = true;
  }
  decal(pos, normal) {
    if (this.decals.length > 40) { const old = this.decals.shift(); this.scene.remove(old); old.geometry.dispose(); }
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8),
      new THREE.MeshBasicMaterial({ color: 0x1a1208, transparent: true, opacity: 0.8 }));
    d.position.copy(pos).addScaledVector(normal, 0.02);
    d.lookAt(pos.clone().add(normal));
    this.scene.add(d); this.decals.push(d);
  }
  explode(pos) {
    this.flash.position.copy(pos); this.flash.intensity = 120; this.flashT = 0.5;
    this.burst(pos, 60, 0xff8c1a, 14);
    this.burst(pos.clone().add(new THREE.Vector3(0, 1, 0)), 30, 0xffd27a, 9);
  }
  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    const attr = this.sparkPoints.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life > 0) {
        s.life -= dt; any = true;
        const p = new THREE.Vector3().fromBufferAttribute(attr, i);
        p.addScaledVector(this.sparkVel[i], dt); p.y -= 3 * dt;
        attr.setXYZ(i, p.x, Math.max(0.02, p.y), p.z);
        if (s.life <= 0) attr.setXYZ(i, 0, -10, 0);
      }
    }
    if (any) attr.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
  }
}
