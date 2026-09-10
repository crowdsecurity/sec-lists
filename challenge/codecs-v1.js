/*
 * Codec capability probe for the CrowdSec AppSec bot challenge.

 */

const H264 = 'video/mp4; codecs="avc1.42E01E"';

function rtcOffersH264() {
  if (typeof RTCRtpSender === "undefined" || !RTCRtpSender.getCapabilities) {
    return null;
  }
  const caps = RTCRtpSender.getCapabilities("video");
  if (!caps || !caps.codecs) {
    return null;
  }
  return caps.codecs.some((c) => /h264/i.test(c.mimeType || ""));
}

export function collectSignals(fp) {
  fp.custom = fp.custom || {};

  // Sentinels: false here means "asked and got no", absent means this module
  // never ran. cfRtcH264 is written before the async work so it survives a
  // timeout on the decodingInfo call.
  fp.custom.cfH264Sup = false;
  fp.custom.cfH264Eff = false;
  fp.custom.cfRtcH264 = false;

  try {
    const rtc = rtcOffersH264();
    if (rtc !== null) {
      fp.custom.cfRtcH264 = rtc;
    }
  } catch {
    // sentinel stands
  }

  if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) {
    return undefined;
  }

  // Own deadline, well inside the shared budget: a hook that outruns it is cut
  // with no result at all, which would look like a stripped module.
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, 250);

    navigator.mediaCapabilities
      .decodingInfo({
        type: "file",
        video: {
          contentType: H264,
          width: 1920,
          height: 1080,
          bitrate: 4000000,
          framerate: 30,
        },
      })
      .then((info) => {
        fp.custom.cfH264Sup = !!info.supported;
        // powerEfficient reflects real hardware decode, which is the half a
        // spoofed desktop tends to get wrong.
        fp.custom.cfH264Eff = !!info.powerEfficient;
        clearTimeout(timer);
        finish();
      })
      .catch(() => {
        clearTimeout(timer);
        finish();
      });
  });
}
