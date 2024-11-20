import { GameObjects } from 'phaser';
import { JudgmentType, type Note } from '../types';
import type { Game } from '../scenes/Game';
import type { Line } from './Line';
import { getTimeSec } from '../utils';
import { HOLD_BODY_TOLERANCE, HOLD_TAIL_TOLERANCE, NOTE_BASE_SIZE } from '../constants';

export class LongNote extends GameObjects.Container {
  private _scene: Game;
  private _data: Note;
  private _line: Line;
  private _modifier: 1 | -1;
  private _head: GameObjects.Image;
  private _body: GameObjects.Image;
  private _tail: GameObjects.Image;
  private _bodyHeight: number;
  private _targetHeadHeight: number = 0;
  private _targetTailHeight: number = 0;
  private _judgmentType: JudgmentType = JudgmentType.UNJUDGED;
  private _beatJudged: number | undefined = undefined;
  private _tempJudgmentType: JudgmentType = JudgmentType.UNJUDGED;
  private _beatTempJudged: number | undefined = undefined;
  private _lastInputBeat: number = 0;

  constructor(scene: Game, data: Note, x: number = 0, y: number = 0, highlight: boolean = false) {
    super(scene, x, y);

    this._scene = scene;
    this._data = data;
    this._modifier = data.above ? -1 : 1;
    this._head = new GameObjects.Image(scene, 0, 0, `2-h${highlight ? '-hl' : ''}`);
    this._body = new GameObjects.Image(scene, 0, 0, `2${highlight ? '-hl' : ''}`);
    this._tail = new GameObjects.Image(scene, 0, 0, `2-t${highlight ? '-hl' : ''}`);
    this._head.setOrigin(0.5, 0);
    this._body.setOrigin(0.5, 1);
    this._tail.setOrigin(0.5, 1);
    this.resize();
    this._bodyHeight = this._body.texture.getSourceImage().height;

    this.add([this._head, this._body, this._tail]);

    scene.add.existing(this);
  }

  update(beat: number, height: number) {
    this.setX(this._scene.p(this._data.positionX));
    this.resize();
    if (this._beatJudged && beat < this._beatJudged) {
      this._scene.judgment.unjudge(this);
    }
    if (this._beatTempJudged && beat < this._beatTempJudged) {
      this.resetTemp();
    }
    let headDist = this._scene.d((this._targetHeadHeight - height) * this._data.speed);
    const tailDist = this._scene.d((this._targetTailHeight - height) * this._data.speed);
    if (beat >= this._data.startBeat) {
      this._head.setVisible(false);
      headDist = Math.max(0, headDist);
    } else {
      this._head.setVisible(headDist >= 0);
    }
    if (beat >= this._data.endBeat) {
      this._body.setVisible(false);
      this._tail.setVisible(false);
    } else {
      this._body.setVisible(tailDist >= 0);
      this._tail.setVisible(tailDist >= 0);
    }
    this._head.setY(this._modifier * headDist);
    this._body.setY(this._modifier * Math.max(0, headDist));
    this._tail.setY(this._modifier * tailDist);
    this._body.scaleY =
      (-this._modifier * Math.max(0, tailDist - Math.max(0, headDist))) / this._bodyHeight;
    if (this._data.isFake) {
      if (this._judgmentType !== JudgmentType.PASSED && beat >= this._data.endBeat)
        this._judgmentType = JudgmentType.PASSED;
      this._beatJudged = beat;
      return;
    }
  }

  updateJudgment(beat: number) {
    if (this._tempJudgmentType === JudgmentType.UNJUDGED) {
      const deltaSec =
        getTimeSec(this._scene.bpmList, beat) -
        getTimeSec(this._scene.bpmList, this._data.startBeat);
      const delta = deltaSec * 1000;
      const { perfectJudgment, goodJudgment } = this._scene.preferences;
      if (beat >= this._data.startBeat) {
        if (this._scene.autoplay) {
          this._scene.judgment.hold(JudgmentType.PERFECT, deltaSec, this);
          return;
        }
        if (delta > goodJudgment) {
          this._scene.judgment.judge(JudgmentType.MISS, this);
          return;
        }
      }
      if (delta >= -goodJudgment && delta <= goodJudgment) {
        const input = this._scene.pointer.findTap(
          this,
          this._scene.timeSec - goodJudgment / 1000,
          this._scene.timeSec + goodJudgment / 1000,
        );
        if (!input) return;
        if (delta < -perfectJudgment) {
          this._scene.judgment.hold(JudgmentType.GOOD_EARLY, deltaSec, this);
        } else if (delta <= perfectJudgment) {
          this._scene.judgment.hold(JudgmentType.PERFECT, deltaSec, this);
        } else {
          this._scene.judgment.hold(JudgmentType.GOOD_LATE, deltaSec, this);
        }
        this._lastInputBeat = beat;
      }
    } else if (this._judgmentType === JudgmentType.UNJUDGED) {
      if (!this._scene.autoplay) {
        const input = this._scene.pointer.findDrag(this);
        if (input) {
          this._lastInputBeat = beat;
        } else if (
          getTimeSec(this._scene.bpmList, beat) -
            getTimeSec(this._scene.bpmList, this._lastInputBeat) >
          HOLD_BODY_TOLERANCE / 1000
        ) {
          this._scene.judgment.judge(JudgmentType.MISS, this);
        }
      }
      if (
        getTimeSec(this._scene.bpmList, this._data.endBeat) -
          getTimeSec(this._scene.bpmList, beat) <
        HOLD_TAIL_TOLERANCE / 1000
      ) {
        this._scene.judgment.judge(this._tempJudgmentType, this);
      }
    }
  }

  setHighlight(highlight: boolean) {
    this._head.setTexture(`2-h${highlight ? '-hl' : ''}`);
    this._body.setTexture(`2${highlight ? '-hl' : ''}`);
    this._tail.setTexture(`2-t${highlight ? '-hl' : ''}`);
    this._bodyHeight = this._body.texture.getSourceImage().height;
  }

  setHeadHeight(height: number) {
    this._targetHeadHeight = height;
  }

  setTailHeight(height: number) {
    this._targetTailHeight = height;
  }

  resize() {
    const scale = this._scene.p(NOTE_BASE_SIZE * this._scene.preferences.noteSize);
    this._head.setScale(this._data.size * scale, -this._modifier * scale);
    this._body.scaleX = this._data.size * scale;
    this._tail.setScale(this._data.size * scale, -this._modifier * scale);
  }

  reset() {
    this._judgmentType = JudgmentType.UNJUDGED;
    this._beatJudged = undefined;
    this.setAlpha(this._data.alpha / 255);
  }

  resetTemp() {
    this._tempJudgmentType = JudgmentType.UNJUDGED;
    this._beatTempJudged = undefined;
  }

  public get judgmentPosition() {
    return {
      x: this._line.x + this.x * Math.cos(this._line.rotation),
      y: this._line.y + this.x * Math.sin(this._line.rotation),
    };
  }

  public get judgmentType() {
    return this._judgmentType;
  }

  setJudgment(type: JudgmentType, beat: number) {
    this._judgmentType = type;
    this._beatJudged = beat;
    if (this._tempJudgmentType === JudgmentType.UNJUDGED) {
      this._tempJudgmentType = type;
      this._beatTempJudged = beat;
    }
  }

  public get beatJudged() {
    return this._beatJudged;
  }

  public get tempJudgmentType() {
    return this._tempJudgmentType;
  }

  setTempJudgment(type: JudgmentType, beat: number) {
    this._tempJudgmentType = type;
    this._beatTempJudged = beat;
  }

  public get beatTempJudged() {
    return this._beatTempJudged;
  }

  public get line() {
    return this._line;
  }

  setLine(line: Line) {
    this._line = line;
  }

  get(key: string) {
    return this._data[key as keyof Note];
  }

  public get note() {
    return this._data;
  }
}
