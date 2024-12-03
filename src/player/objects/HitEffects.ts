import { GameObjects } from 'phaser';
import { JudgmentType } from '../types';
import { getJudgmentColor } from '../utils';
import type { Game } from '../scenes/Game';
import {
  HIT_EFFECTS_PARTICLE_SIZE,
  HIT_EFFECTS_PARTICLE_SPREAD_RANGE,
  HIT_EFFECTS_SIZE,
} from '../constants';

export class HitEffects extends GameObjects.Sprite {
  private _scene: Game;
  private _color: number;

  constructor(scene: Game, x: number, y: number, type: JudgmentType) {
    super(scene, x, y, 'hit-effects');

    this._scene = scene;
    this._color = getJudgmentColor(type);
    this.setScale(this._scene.p(HIT_EFFECTS_SIZE));
    this.setOrigin(0.5);
    this.setTint(this._color);
    this.setDepth(7);
    scene.add.existing(this);
  }

  hit(tint?: number) {
    if (tint) {
      this.setTint(tint);
    }
    this.play('hit-effects');
    Array(4)
      .fill(null)
      .forEach(() => this.particle(tint));
    this.once('animationcomplete', () => {
      this.destroy();
    });
  }

  particle(tint?: number) {
    const particle = this.scene.add
      .rectangle(
        this.x,
        this.y,
        this.scaleX * HIT_EFFECTS_PARTICLE_SIZE,
        this.scaleY * HIT_EFFECTS_PARTICLE_SIZE,
        tint ?? this._color,
      )
      .setOrigin(0.5)
      .setScale(0)
      .setDepth(7);
    const range = this.scale * HIT_EFFECTS_PARTICLE_SPREAD_RANGE;
    this.scene.tweens.add({
      targets: particle,
      x: this.x + Math.random() * range - range / 2,
      y: this.y + Math.random() * range - range / 2,
      ease: 'Quint',
      duration: 800,
      repeat: 0,
    });
    this.scene.tweens.add({
      targets: particle,
      scale: 1,
      ease: 'Cubic.easeOut',
      duration: 300,
      repeat: 0,
    });
    this.scene.tweens.add({
      targets: particle,
      scale: 0,
      ease: 'Cubic.easeIn',
      duration: 500,
      delay: 300,
      repeat: 0,
    });
    this.scene.tweens.add({
      targets: particle,
      alpha: 0,
      ease: 'Cubic.easeIn',
      duration: 600,
      repeat: 0,
      onComplete: () => {
        particle.destroy();
      },
    });
  }
}
