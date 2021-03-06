/**
 * Constructs RTCPeerConnection and binds our event listeners to it
 * @return {RTCPeerConnection} The modified PeerConnection object
 */
let createPeerConnection = () => {
  const RTCconf = {"iceServers": [
    {"urls": ["stun:stun.l.google.com:19302"]},
    {"urls": [`turn:${window.location.host}:5349`], "username":"public", "credential":"a"}
  ]}
  let pc = new RTCPeerConnection(RTCconf)

  pc.onicecandidate = event => {
    if (!event.candidate) return
    signaler.send(JSON.stringify({
      type: 'new-ice-candidate',
      data: {
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      }
    }))
  }

  pc.addEventListener('addstream', event => {
    vid_other_1.srcObject = event.stream
    vid_other_1.play()
  })

  return pc
}

let pc = createPeerConnection()
let need_to_call = false
let self_stream = false
let connected = false

/**
 * Initiates a call to the room
 */
let call = () => {
  pc.createOffer().then(desc => {
    pc.setLocalDescription(desc).then(() => {
      signaler.send(JSON.stringify({
        type: 'video-offer',
        data: desc
      }))
    })
  })
}

/**
 * Websocket connection to signaling server, used to exchange negotiation messages with other peers
 */
const signaler = new WebSocket(`wss://${window.location.host}${window.location.pathname}`)

signaler.onmessage = mes => {
  const msg = JSON.parse(mes.data)

  // All the ways to handle messages from the signaling server
  const handlers = {
    // Methods defined by the spec
    'video-offer': () => {
      pc.setRemoteDescription(new RTCSessionDescription(msg.data)).then(() => {
        pc.createAnswer().then(desc => {
          pc.setLocalDescription(desc).then(() => {
            signaler.send(JSON.stringify({
              type: 'video-answer',
              data: desc
            }))
          })
        })
      }).catch(err => console.error(err))
    },
    'video-answer': () => {
      if (!connected) {
        pc.setRemoteDescription(new RTCSessionDescription(msg.data))
        connected = true
      }
    },
    'new-ice-candidate': () => {
      const candidate = new RTCIceCandidate({
        sdpMLineIndex: msg.data.label,
        candidate: msg.data.candidate,
        sdpMid: msg.data.id
      })
      pc.addIceCandidate(candidate).catch(err => console.error(err))
    },
    // Methods specific to our signaling server
    'init': () => {
      signaler.id = msg.id
      if (!msg.call_room) return
      self_stream ? call() : (need_to_call = true)
    },
    'close': () => {
      pc.close()
      connected = false
      vid_other_1.srcObject = null
      pc = createPeerConnection()
      pc.addStream(self_stream)
    },
    'pong': () => {}
  }

  if (Object.keys(handlers).includes(msg.type)) {
    handlers[msg.type]()
  } else {
    console.error('Unknown message from server:', msg)
  }
}

// Initialize local vedeo stream and start the call if someone else is in the room
navigator.mediaDevices.getUserMedia({audio: true, video: true}).then(stream => {
  self_stream = stream
  pc.addStream(stream)
  vid_self.srcObject = stream
  vid_self.play()
  if (need_to_call) call()
}).catch(error => {
  alert("Failed to access webcam")
  console.error(error)
})

// Heartbeat to keep the websocket open
window.setInterval(() => {
  signaler.send(JSON.stringify({type: 'ping'}))
}, 10000)

// Be nice and tell the signaling server we're leaving
window.addEventListener('beforeunload', () => {
  signaler.send(JSON.stringify({type: 'close'}))
  pc.close()
})

$('.mute-button').addEventListener('click', () => {
  const enabled = self_stream.getAudioTracks()[0].enabled
  self_stream.getAudioTracks()[0].enabled = !enabled
  $('.mute-button').className = 'mute-button mute-'+(enabled?'enabled':'disabled')
  $('.mute-button').title = (enabled?'Unm':'M')+'ute your microphone'
})

$('#vid_self').addEventListener('click', () => {
  $('#vid_self').setAttribute('data-pos', ({
    'bottom-right': 'top-right',
    'top-right'   : 'top-left',
    'top-left'    : 'bottom-left',
    'bottom-left' : 'bottom-right'
  })[$('#vid_self').getAttribute('data-pos')])
})
