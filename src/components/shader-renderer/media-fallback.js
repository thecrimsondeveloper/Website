export class MediaFallback {
  constructor(video) {
    this.video = video;
  }

  showImage() {
    this.video.pause();
    this.video.removeAttribute("src");
  }

  async showVideo(source) {
    if (!source) {
      this.showImage();
      return false;
    }

    this.video.src = source;
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;

    try {
      await this.video.play();
      return true;
    } catch {
      this.showImage();
      return false;
    }
  }

  showWebGL() {
    this.video.pause();
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
}
