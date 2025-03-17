import { Cameras, GameObjects, Renderer, Scene, Sound } from 'phaser';
import { EventBus } from '../EventBus';
import { inferLevelType, fit, send, getLines, IS_TAURI } from '$lib/utils';
import {
  processIllustration,
  loadJson,
  toBeats,
  getAudio,
  calculatePrecedences,
  loadText,
  getSpritesheet,
  findHighlightMoments,
  loadChart,
} from '../utils';
import {
  GameStatus,
  type Bpm,
  type Config,
  type GameObject,
  type PhiraExtra,
  type RpeJson,
  type ShaderEffect,
} from '$lib/types';
import { Line } from '../objects/Line';
import type { LongNote } from '../objects/LongNote';
import type { PlainNote } from '../objects/PlainNote';
import { GameUI } from '../objects/GameUI';
import { EndingUI } from '../objects/EndingUI';
import { PointerHandler } from '../handlers/PointerHandler';
import { KeyboardHandler } from '../handlers/KeyboardHandler';
import { JudgmentHandler } from '../handlers/JudgmentHandler';
import { StatisticsHandler } from '../handlers/StatisticsHandler';
import { terminateFFmpeg } from '../ffmpeg';
import { ShaderPipeline } from '../objects/ShaderPipeline';
import { Video } from '../objects/Video';
import { SignalHandler } from '../handlers/SignalHandler';
import { Node, ROOT } from '../objects/Node';
import { ShaderNode } from '../objects/ShaderNode';
import { base } from '$app/paths';
import { ClockHandler } from '../handlers/ClockHandler';

export class Game extends Scene {
  private _status: GameStatus = GameStatus.LOADING;

  private _data: Config;
  private _chart: RpeJson;
  private _songUrl: string;
  private _chartUrl: string;
  private _illustrationUrl: string;
  private _extraUrl: string | undefined;
  private _extra: PhiraExtra | undefined;
  private _lineCsvUrl: string | undefined;
  private _animatedAssets: {
    key: string;
    url: string;
    isGif: boolean;
    frameCount?: number;
    frameRate?: number;
    repeat?: number;
  }[] = [];
  private _audioAssets: { key: string; url: string }[] = [];
  private _shaderAssets: { key: string; url: string; source?: string }[] = [];
  private _skinSize: number | undefined = undefined;

  private _title: string | null;
  private _composer: string | null;
  private _charter: string | null;
  private _illustrator: string | null;
  private _levelType: 0 | 1 | 2 | 3 | 4;
  private _level: string | null;
  private _offset: number;
  private _bpmList: Bpm[];
  private _numberOfNotes: number;
  private _autoplay = false;
  private _practice = false;
  private _autostart = false;
  private _adjustOffset = false;
  private _render = false;

  private _bpmIndex: number = 0;
  private _lines: Line[];
  private _notes: (PlainNote | LongNote)[];
  private _shaders:
    | (
        | {
            key: string;
            effect: ShaderEffect;
            target: Cameras.Scene2D.Camera | ShaderNode;
          }
        | undefined
      )[]
    | undefined;
  private _videos: Video[] | undefined;
  private _visible: boolean = true;
  private _timeout: NodeJS.Timeout;
  private _isSeeking: boolean = false;
  private _timeScale: number = 1;
  private _lastProgressUpdate: number | undefined;

  private _objects: Node[] = [];

  private _song: Sound.NoAudioSound | Sound.HTML5AudioSound | Sound.WebAudioSound;
  private _background: GameObjects.Image;
  private _gameUI: GameUI;
  private _endingUI?: EndingUI;

  private _clock: ClockHandler;
  private _pointerHandler: PointerHandler;
  private _keyboardHandler: KeyboardHandler;
  private _judgmentHandler: JudgmentHandler;
  private _statisticsHandler: StatisticsHandler;

  constructor() {
    super('Game');
  }

  init() {
    const val = localStorage.getItem('player');
    if (!val) {
      this._status = GameStatus.ERROR;
      alert('No data is provided.');
      return;
    }
    this._data = JSON.parse(val);
    localStorage.removeItem('player');
  }

  preload() {
    if (this._status === GameStatus.ERROR) return;

    this.load.on('progress', (progress: number) => {
      EventBus.emit('loading', progress);
    });
    this.load.on('fileprogress', (e: { key: string; url: string }) => {
      EventBus.emit(
        'loading-detail',
        e.url.startsWith('blob:')
          ? `Loading ${e.key ?? 'file'}`
          : `Loading ${e.url.split('/').pop()}`,
      );
    });
    this.load.setPath(`${base}/game`);

    this.load.bitmapFont('Outfit', 'fonts/Outfit/Outfit.png', 'fonts/Outfit/Outfit.fnt');

    this.load.svg('pause', 'Pause.svg', { width: 128, height: 128 });
    this.load.image('progress-bar', 'Progress.png');

    this.load.audio('4', 'hitsounds/Drag.wav');
    this.load.audio('3', 'hitsounds/Flick.wav');
    this.load.audio('2', 'hitsounds/Tap.wav');
    this.load.audio('1', 'hitsounds/Tap.wav');
    this.load.audio('grade-hit', 'ending/GradeHit.wav');

    this.load.image('4', 'notes/Drag.png');
    this.load.image('4-hl', 'notes/DragHL.png');
    this.load.image('3', 'notes/Flick.png');
    this.load.image('3-hl', 'notes/FlickHL.png');
    this.load.image('2', 'notes/Hold.png');
    this.load.image('2-hl', 'notes/HoldHL.png');
    this.load.image('2-h', 'notes/HoldHead.png');
    this.load.image('2-h-hl', 'notes/HoldHeadHL.png');
    this.load.image('2-t', 'notes/HoldTail.png');
    this.load.image('2-t-hl', 'notes/HoldTailHL.png');
    this.load.image('1', 'notes/Tap.png');
    this.load.image('1-hl', 'notes/TapHL.png');

    this.load.image('grade-3', 'grades/A.png');
    this.load.image('grade-2', 'grades/B.png');
    this.load.image('grade-1', 'grades/C.png');
    this.load.image('grade-0', 'grades/F.png');
    this.load.image('grade-7', 'grades/Phi.png');
    this.load.image('grade-4', 'grades/S.png');
    this.load.image('grade-6', 'grades/V-FC.png');
    this.load.image('grade-5', 'grades/V.png');

    this.load.image('asset-line.png', 'line.png');
    this.load.spritesheet('hit-effects', 'HitEffects.png', {
      frameWidth: 375,
      frameHeight: 375,
    });

    const { song, chart, illustration, assetNames, assetTypes, assets } = this._data.resources;

    this._songUrl = song;
    this._chartUrl = chart;
    this._illustrationUrl = illustration;
    this._title = this._data.metadata.title;
    this._composer = this._data.metadata.composer;
    this._charter = this._data.metadata.charter;
    this._illustrator = this._data.metadata.illustrator;
    this._levelType = this._data.metadata.levelType;
    this._level =
      this._data.metadata.level !== null && this._data.metadata.difficulty !== null
        ? `${this._data.metadata.level}  Lv.${this._data.metadata.difficulty?.toFixed(0)}`
        : this._data.metadata.level;
    this._autoplay = this._data.autoplay;
    this._practice = this._data.practice;
    this._autostart = this._data.autostart;
    this._adjustOffset = this._data.adjustOffset;
    this._render = this._data.render && IS_TAURI;

    if (new window.AudioContext().state === 'suspended') {
      this._autostart = false;
    }

    assets.forEach((asset, i) => {
      const name = assetNames[i];
      const key = `asset-${name}`;
      if (assetTypes[i] === 0)
        if (name.toLowerCase().endsWith('.gif'))
          this._animatedAssets.push({ key, url: asset, isGif: true });
        else if (name.toLowerCase().endsWith('.apng'))
          this._animatedAssets.push({ key, url: asset, isGif: false });
        else this.load.image(key, asset);
      else if (assetTypes[i] === 1) this._audioAssets.push({ key, url: asset });
      else if (assetTypes[i] === 2) this.load.video(key, asset, true);
      else if (assetTypes[i] === 3) {
        const nameLower = name.toLowerCase();
        if (nameLower === 'extra.json') this._extraUrl = asset;
        else if (nameLower === 'line.csv') this._lineCsvUrl = asset;
        else console.log('To be implemented:', name);
        // TODO
      } else if (assetTypes[i] === 4)
        this._shaderAssets.push({
          key,
          url: asset,
        });
      else console.log('Not supported:', name); // TODO
    });
  }

  create() {
    if (this._status === GameStatus.ERROR) return;
    const load = async () => {
      const { background, cropped } = await processIllustration(
        this._illustrationUrl,
        80 * this._data.preferences.backgroundBlur,
        this._data.preferences.backgroundLuminance,
      );
      this.load.image('illustration-background', background);
      this.load.image('illustration-cropped', cropped);
      this.load.audio('song', await getAudio(this._songUrl));
      await Promise.all([
        ...this._animatedAssets.map(async (asset) => {
          const spritesheet = await getSpritesheet(asset.url, asset.isGif);
          // console.log(spritesheet.frameSize, spritesheet.frameCount, spritesheet.frameRate);
          // spritesheet.spritesheet.toBlob((e) => {
          //   if (e) console.log(URL.createObjectURL(e));
          // });
          this.load.spritesheet(
            asset.key,
            spritesheet.spritesheet.toDataURL(),
            spritesheet.frameSize,
          );
          asset.frameCount = spritesheet.frameCount;
          asset.frameRate = spritesheet.frameRate;
          asset.repeat = spritesheet.repeat;
        }),
        ...this._audioAssets.map(async (asset) =>
          this.load.audio(asset.key, await getAudio(asset.url)),
        ),
      ]);
      this.createHitEffectsAnimation();
      const chart = await loadChart(this._chartUrl);
      if (!chart) {
        this._status = GameStatus.ERROR;
        alert('Failed to load chart.');
        return;
      }
      this._chart = chart;
      if (this._extraUrl) {
        const extra = await loadJson(this._extraUrl, 'extra.json');
        this._extra = extra;
        if (!this._extra) {
          this._status = GameStatus.ERROR;
          alert('Failed to load extra.json.');
          return;
        }
        this._extra.effects.forEach((effect) => {
          if (effect.shader.startsWith('/')) {
            effect.shader = `asset-${effect.shader.slice(1)}`;
          } else {
            this._shaderAssets.push({
              key: `intsh-${effect.shader}`,
              url: base + '/game/shaders/' + effect.shader + '.glsl',
            });
            effect.shader = `intsh-${effect.shader}`;
          }
        });
        await Promise.all(
          this._shaderAssets.map(async (asset) => {
            asset.source = await loadText(asset.url, asset.key);
          }),
        );
      }
      if (this._lineCsvUrl) {
        const lineCsv = await loadText(this._lineCsvUrl, 'line.csv');
        if (lineCsv) {
          const [_header, ...rows] = getLines(lineCsv);
          const data = rows.map((row) => row.split(','));
          if (data.length > 0 && data[0].length >= 3) {
            data.forEach((row) => {
              const line = this._chart.judgeLineList.at(parseInt(row[1]));
              if (line) {
                line.Texture = row[2];
              }
            });
          }
        }
      }
      this.load.audio('ending', `ending/LevelOver${this._levelType}.wav`);
      this.load.once('complete', async () => {
        this.createTextureAnimations();
        this.initializeChart();
        this.initializeShaders();
        this.preprocess();
        this.initializeHandlers();
        this.setupUI();
        this.createBackground();
        this.createAudio();
        await this.initializeVideos();
        if (this._autostart) {
          this.start();
        } else {
          this._status = GameStatus.READY;
        }
        this._lines.forEach((line) => line.setVisible(true));
        if (this._adjustOffset) {
          EventBus.on('offset-adjusted', (offset: number) => {
            this._chart.META.offset = offset;
            this._offset = this._chart.META.offset;
          });
        }
        EventBus.emit('current-scene-ready', this);
      });
      this.load.start();
    };
    load();
  }

  in() {
    this._gameUI.in();
    const targets = [...this._lines.map((l) => l.elements).flat(), ...(this._videos ?? [])];
    targets.forEach((target) => {
      target.alpha = 0;
    });
    this.tweens.add({
      targets,
      alpha: 1,
      duration: 1000,
      ease: 'Sine.easeOut',
    });
  }

  out(onComplete: () => void) {
    this._gameUI.out();
    this.tweens.add({
      targets: [...this._lines.map((l) => l.elements).flat(), ...(this._videos ?? [])],
      alpha: 0,
      duration: 1000,
      ease: 'Sine.easeIn',
      onComplete,
    });
  }

  resetShadersAndVideos() {
    this._shaders?.forEach((shader) => {
      if (!shader) return;
      ('object' in shader.target ? shader.target.object : shader.target).resetPostPipeline();
    });
    this._videos?.forEach((video) => video.destroy());
  }

  start() {
    if (this._status === GameStatus.ERROR) return;
    this._objects.sort((a, b) => a.depth - b.depth);
    this.in();
    if (!this._render)
      this._timeout = setTimeout(() => {
        this._clock.play();
      }, 1000 / this.tweens.timeScale);
    this._status = GameStatus.PLAYING;
    this.updateChart(this.beat, this.timeSec, Date.now());
    EventBus.emit('started');
    send({
      type: 'event',
      payload: {
        name: 'started',
      },
    });
    this.game.events.on('hidden', () => {
      this._visible = false;
      if (this._status !== GameStatus.FINISHED) this.pause();
    });
    this.game.events.on('visible', () => {
      this._visible = true;
    });
    this._song.on('complete', () => {
      this.end();
    });
  }

  pause(emittedBySpace: boolean = false) {
    if (this._status === GameStatus.ERROR || !this._song.isPlaying) return;
    clearTimeout(this._timeout);
    this._status = GameStatus.PAUSED;
    if (!this._render) this._clock.pause();
    this._videos?.forEach((video) => video.pause());
    EventBus.emit('paused', emittedBySpace);
    send({
      type: 'event',
      payload: {
        name: 'paused',
      },
    });
  }

  resume() {
    if (this._status === GameStatus.ERROR) return;
    this.updateChart(this.beat, this.timeSec, Date.now());
    this._status = GameStatus.PLAYING;
    if (!this._render) this._clock.resume();
    this._videos?.forEach((video) => video.resume());
    EventBus.emit('started');
    send({
      type: 'event',
      payload: {
        name: 'resumed',
      },
    });
  }

  async restart() {
    if (this._status === GameStatus.ERROR) return;
    this._status = GameStatus.LOADING;
    if (!this._render) this._clock.pause();
    this._pointerHandler.reset();
    this._keyboardHandler.reset();
    this._judgmentHandler.reset();
    this._clock.setSeek(0);
    this._endingUI?.destroy();
    this._endingUI = undefined;
    this.resetShadersAndVideos();
    this.initializeShaders();
    await this.initializeVideos();
    this._objects.sort((a, b) => a.depth - b.depth);
    this.in();
    if (!this._render)
      this._timeout = setTimeout(() => {
        this._clock.play();
      }, 1000 / this.tweens.timeScale);
    this._status = GameStatus.PLAYING;
    EventBus.emit('started');
    send({
      type: 'event',
      payload: {
        name: 'restarted',
      },
    });
  }

  end() {
    if (this._status === GameStatus.ERROR) return;
    this._status = GameStatus.FINISHED;
    this.out(() => {
      this.resetShadersAndVideos();
      this._endingUI!.play();
      EventBus.emit('finished');
      send({
        type: 'event',
        payload: {
          name: 'finished',
        },
      });
    });
    this._endingUI = new EndingUI(this, this._data.mediaOptions.endingLoopsToRender);
  }

  setSeek(value: number) {
    this._isSeeking = true;
    this._clock.setSeek(value);
    this._videos?.forEach((video) => video.setSeek(value));
  }

  update(time: number, delta: number) {
    if (
      !this._song ||
      this._status === GameStatus.DESTROYED ||
      this._status === GameStatus.ERROR ||
      this._status === GameStatus.LOADING
    ) {
      if (this._status === GameStatus.ERROR) {
        EventBus.emit('error');
        send({
          type: 'event',
          payload: {
            name: 'errored',
          },
        });
      }
      return;
    }
    if (!this._render) {
      this._clock.update();
    }
    if (this._endingUI) this._endingUI.update();
    const status = this._status;
    if (this._isSeeking) this._status = GameStatus.SEEKING;
    this._pointerHandler.update(delta);
    if (this._visible) {
      this._gameUI.update();
      this.positionBackground(this._background);
    }
    const realTimeSec = this.realTimeSec;
    this.report(time, realTimeSec);
    this.updateChart(this.beat, this.timeSec, time);
    this.statistics.updateDisplay(delta);
    if (this._isSeeking) {
      this._status = status;
      this._isSeeking = false;
    }
  }

  report(gameTime: number, songTime: number) {
    EventBus.emit('update', songTime);
    if (!this._lastProgressUpdate || gameTime - this._lastProgressUpdate >= 100) {
      this._lastProgressUpdate = gameTime;
      send({
        type: 'event',
        payload: {
          name: 'progress',
          value: songTime,
        },
      });
    }
  }

  destroy() {
    this._status = GameStatus.DESTROYED;
    this._song.destroy();
    this._lines.forEach((line) => line.destroy());
    this._gameUI.destroy();
    if (this._endingUI) this._endingUI.destroy();
    terminateFFmpeg();
  }

  updateChart(beat: number, songTime: number, gameTime: number) {
    if (this._status === GameStatus.FINISHED || this._status === GameStatus.DESTROYED) return;
    gameTime *= this._timeScale;
    this._lines.forEach((line) => line.update(beat, songTime, gameTime));
    this._notes.forEach((note) => note.updateJudgment(beat, songTime));
    this._shaders?.forEach((shader) => {
      if (!shader) return;
      (
        ('object' in shader.target
          ? shader.target.object.getPostPipeline(shader.key)
          : shader.target.getPostPipeline(shader.key)) as ShaderPipeline
      )?.detach(beat);
    });
    this._shaders?.forEach((shader) => {
      if (!shader) return;
      (
        ('object' in shader.target
          ? shader.target.object.getPostPipeline(shader.key)
          : shader.target.getPostPipeline(shader.key)) as ShaderPipeline
      )?.update(beat, songTime);
    });
    this._videos?.forEach((video) => video.update(beat, songTime));
  }

  createAudio() {
    this.sound.pauseOnBlur = false;
    this._song = this.sound.add('song');
    this._song.setVolume(this._data.preferences.musicVolume);
    this._clock = new ClockHandler(
      this._song,
      this.sound,
      () => this._status === GameStatus.FINISHED || this.end(),
    );
    this.timeScale = this._data.preferences.timeScale;
  }

  createBackground() {
    EventBus.emit('loading-detail', 'Drawing background');
    this._background = new GameObjects.Image(
      this,
      this.sys.canvas.width / 2,
      this.sys.canvas.height / 2,
      'illustration-background',
    ).setDepth(0);
    this.registerNode(this._background, 'illustration');
    this.positionBackground(this._background);
  }

  positionBackground(
    object: GameObjects.Image | GameObjects.Video | GameObjects.Rectangle,
    mode: 'envelop' | 'fit' | 'stretch' = 'envelop',
    refWidth?: number,
    refHeight?: number,
    scaleOnly = false,
  ) {
    if (!scaleOnly) object.setPosition(this.sys.canvas.width / 2, this.sys.canvas.height / 2);
    refWidth ??= this.sys.canvas.width;
    refHeight ??= this.sys.canvas.height;
    const dimensions =
      mode !== 'stretch'
        ? fit(object.displayWidth, object.displayHeight, refWidth, refHeight, mode === 'fit')
        : { width: refWidth, height: refHeight };
    object.displayWidth = dimensions.width;
    object.displayHeight = dimensions.height;
  }

  initializeChart() {
    EventBus.emit('loading-detail', 'Initializing chart');
    const chart = this._chart;
    this._offset =
      chart.META.offset + (this._adjustOffset ? 0 : this._data.preferences.chartOffset);
    this._bpmList = chart.BPMList;

    if (!this._title) this._title = chart.META.name;
    if (!this._composer) this._composer = chart.META.composer;
    if (!this._charter) this._charter = chart.META.charter;
    if (!this._illustrator) this._illustrator = chart.META.illustration ?? null;
    if (!this._level) {
      this._level = chart.META.level;
      this._levelType = inferLevelType(chart.META.level);
    }

    EventBus.emit('metadata', {
      title: this._title,
      composer: this._composer,
      charter: this._charter,
      illustrator: this._illustrator,
      levelType: this._levelType,
      level: this._level,
    });

    let lastBpm = 0;
    let lastBeat = 0;
    let lastTimeSec = 0;
    this._bpmList.forEach((bpm, i) => {
      bpm.startBeat = toBeats(bpm.startTime);
      bpm.startTimeSec =
        i === 0 ? lastTimeSec : lastTimeSec + ((bpm.startBeat - lastBeat) / lastBpm) * 60;
      lastBpm = bpm.bpm;
      lastBeat = bpm.startBeat;
      lastTimeSec = bpm.startTimeSec;
    });

    const precedences = calculatePrecedences(this._chart.judgeLineList.map((data) => data.zOrder));
    const moments = findHighlightMoments(
      this._chart.judgeLineList.map((line) => line.notes ?? []).flat(),
    );
    this._lines = this._chart.judgeLineList.map(
      (data, i) => new Line(this, data, i, precedences.get(data.zOrder)!, moments),
    );
  }

  preprocess() {
    EventBus.emit('loading-detail', 'Preprocessing chart');
    const notes = this._lines
      .map((line) => line.notes)
      .flat()
      .sort((a, b) => a.note.startBeat - b.note.startBeat);
    this._notes = notes
      .filter((note) => !note.note.isFake)
      .sort((a, b) =>
        a.note.startBeat === b.note.startBeat
          ? a.note.type - b.note.type
          : a.note.startBeat - b.note.startBeat,
      );
    this._numberOfNotes = this._notes.length;
    this._lines
      .filter((line) => line.data.father != -1)
      .forEach((line) => {
        const father = this._lines[line.data.father];
        line.setParent(father);
      });
  }

  initializeHandlers() {
    EventBus.emit('loading-detail', 'Initializing handlers');
    this._pointerHandler = new PointerHandler(this);
    this._keyboardHandler = new KeyboardHandler(this);
    this._judgmentHandler = new JudgmentHandler(this);
    this._statisticsHandler = new StatisticsHandler(this);
  }

  setupUI() {
    EventBus.emit('loading-detail', 'Setting up UI');
    this._gameUI = new GameUI(this);
  }

  createHitEffectsAnimation() {
    EventBus.emit('loading-detail', 'Initializing hit effects');
    this.anims.create({
      key: 'hit-effects',
      frames: 'hit-effects',
      frameRate: 120,
      repeat: 0,
    });
  }

  createTextureAnimations() {
    this._animatedAssets.forEach((asset) => {
      this.anims.create({
        key: asset.key,
        frames: this.anims.generateFrameNumbers(asset.key, {
          start: 0,
          end: asset.frameCount ? asset.frameCount - 1 : 0,
        }),
        frameRate: asset.frameRate,
        repeat: asset.repeat,
      });
    });
  }

  initializeShaders() {
    if (!this._extra) return;

    EventBus.emit('loading-detail', 'Initializing shaders');
    const missing: string[] = [];
    this._shaders = this._extra.effects.map((effect, i) => {
      const asset = this._shaderAssets.find((asset) => asset.key === effect.shader);
      if (!asset) {
        if (!missing.includes(effect.shader)) {
          missing.push(effect.shader);
          alert(`Unable to locate external shader ${effect.shader.slice(6)}`);
        }
        return undefined;
      }
      const key = `sh-${effect.shader.slice(6)}-${i}`;
      (this.renderer as Renderer.WebGL.WebGLRenderer).pipelines.addPostPipeline(
        key,
        ShaderPipeline,
      );
      let target;
      if (effect.global) {
        target = this.cameras.main;
        target.setPostPipeline(key, {
          scene: this,
          fragShader: asset.source,
          data: effect,
        });
      } else {
        if (!effect.targetRange) {
          effect.targetRange = {
            minZIndex: 0,
            maxZIndex: 8,
            exclusive: false,
          };
        }
        target = this.registerShaderNode(
          new GameObjects.Layer(this),
          effect.targetRange.minZIndex,
          effect.targetRange.maxZIndex,
          key,
        );
        target.object.setPostPipeline(key, {
          scene: this,
          fragShader: asset.source,
          data: effect,
          target,
        });
      }
      return { key, effect, target };
    });
  }

  async initializeVideos() {
    if (!this._extra?.videos || this._extra.videos.length === 0) return;

    EventBus.emit('loading-detail', 'Initializing videos');

    const signalHandler = new SignalHandler(this._extra.videos.length);
    this._videos = this._extra.videos.map(
      (data) =>
        new Video(this, data, (errorMsg?: string, exception?: DOMException | string) => {
          signalHandler.emit();
          if (errorMsg) {
            if (exception) {
              console.error(errorMsg, exception);
            }
            alert(errorMsg);
          }
        }),
    );
    await signalHandler.wait();
  }

  registerNode(object: GameObject, name: string) {
    this.add.existing(object);
    const entry = new Node(name, object, object.depth, ROOT);
    this._objects.push(entry);
    return entry;
  }

  registerShaderNode(
    object: GameObjects.Layer,
    lowerDepth: number,
    upperDepth: number,
    name: string,
  ) {
    object.setDepth(lowerDepth);
    this.add.existing(object);
    const entry = new ShaderNode(name, object, lowerDepth, upperDepth, ROOT);
    this._objects.push(entry);
    return entry;
  }

  getBeat(songTime: number) {
    if (this._bpmIndex > 0 && songTime < this._bpmList[this._bpmIndex].startTimeSec) {
      this._bpmIndex = 0;
    }
    while (
      this._bpmIndex < this._bpmList.length - 1 &&
      songTime >= this._bpmList[this._bpmIndex + 1].startTimeSec
    ) {
      this._bpmIndex++;
    }
    const curBpm = this._bpmList[this._bpmIndex];
    return curBpm.startBeat + ((songTime - curBpm.startTimeSec) / 60) * curBpm.bpm;
  }

  w(width: number) {
    return (width / 1350) * this.sys.canvas.width + this.sys.canvas.width / 2;
  }

  p(position: number) {
    return (position / 1350) * this.sys.canvas.width;
  }

  h(height: number) {
    return (-height / 900) * this.sys.canvas.height + this.sys.canvas.height / 2;
  }

  o(offset: number) {
    return (offset / 900) * this.sys.canvas.height;
  }

  d(distance: number) {
    return (distance * this.sys.canvas.height * 2) / 15;
  }

  public set timeScale(value: number) {
    this._timeScale = value;
    if (this._autoplay) {
      this.sound.setRate(value);
      this.anims.globalTimeScale = value;
      this.tweens.timeScale = value;
      this._clock.sync();
    } else {
      this._clock.setRate(value);
    }
  }

  public get gameUI() {
    return this._gameUI;
  }

  public get endingUI() {
    return this._endingUI;
  }

  public get clock() {
    return this._clock;
  }

  public get pointer() {
    return this._pointerHandler;
  }

  public get keyboard() {
    return this._keyboardHandler;
  }

  public get judgment() {
    return this._judgmentHandler;
  }

  public get statistics() {
    return this._statisticsHandler;
  }

  public get lines() {
    return this._lines;
  }

  public get notes() {
    return this._notes;
  }

  public get numberOfNotes() {
    return this._numberOfNotes;
  }

  public get metadata() {
    return {
      title: this._title,
      composer: this._composer,
      charter: this._charter,
      illustrator: this._illustrator,
      level: this._level,
    };
  }

  public get preferences() {
    return this._data.preferences;
  }

  public get beat() {
    return this.getBeat(this.timeSec);
  }

  public get timeSec() {
    return this.realTimeSec - this._offset / 1000;
  }

  public get realTimeSec() {
    return this._status === GameStatus.FINISHED ? this._song.duration : this._clock.seek;
  }

  public get bpm() {
    return this._bpmList[this._bpmIndex].bpm;
  }

  public get bpmList() {
    return this._bpmList;
  }

  public get chart() {
    return this._chart;
  }

  public get song() {
    return this._song;
  }

  public get songUrl() {
    return this._songUrl;
  }

  public get status() {
    return this._status;
  }

  public get skinSize() {
    if (!this._skinSize) {
      this._skinSize = this.textures.get('1').getSourceImage().width;
    }
    return this._skinSize;
  }

  public get timeScale() {
    return this._timeScale;
  }

  public get autoplay() {
    return this._autoplay;
  }

  public get practice() {
    return this._practice;
  }

  public get adjustOffset() {
    return this._adjustOffset;
  }

  public get render() {
    return this._render;
  }

  public get objects() {
    return this._objects;
  }
}
