export class MediaFallback {
  constructor(host, video) {
    this.host = host;
    this.video = video;
  }

  showImage() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.host.dataset.mode = "image";
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
      this.host.dataset.mode = "video";
      return true;
    } catch {
      this.showImage();
      return false;
    }
  }

  showWebGL() {
    this.video.pause();
    this.host.dataset.mode = "webgl";
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
}
