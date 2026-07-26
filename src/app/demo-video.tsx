// The walkthrough's YouTube ID - the part after v= or youtu.be/. One constant,
// one place to swap if the video is ever re-cut and re-uploaded.
const YT_ID = "1gCXPxPqfy0";

// Postiz's shape: a plain iframe in a fixed 16:9 box, wearing the same browser
// chrome as the screenshot slideshow above it so the two read as one system.
// YouTube paints its own thumbnail and play button, so there's no poster asset
// to keep in sync with the video. `loading="lazy"` keeps the player's JS off
// the critical path - the section sits below the fold, so nobody pays for it
// until they scroll to it.
export function DemoVideo() {
  return (
    <div className="show-frame-wrap demo-frame-wrap">
      <div className="show-frame">
        <div className="show-chrome" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="show-media">
          <div className="demo-stack">
            <iframe
              className="demo-iframe"
              src={`https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`}
              title="DispatchSEO demo video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
