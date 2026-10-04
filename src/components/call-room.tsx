/**
 * The live part of a call. Kept in its own file and loaded only in builds that include WebRTC
 * (TestFlight / development build), so Expo Go never evaluates these imports.
 */
import {
  AudioSession, LiveKitRoom, registerGlobals, useLocalParticipant, useParticipants, useTracks, VideoTrack, isTrackReference,
} from '@livekit/react-native';
import { SymbolView } from 'expo-symbols';
import { Track } from 'livekit-client';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Palette } from '@/constants/theme';

registerGlobals();

type Props = { url: string; token: string; video: boolean; c: Palette; onLeave: (othersStillOn?: number) => void; title: string };

export default function CallRoom({ url, token, video, c, onLeave, title }: Props) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => { AudioSession.stopAudioSession(); };
  }, []);

  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={video} onDisconnected={() => onLeave()} options={{ adaptiveStream: true }}>
      <Stage c={c} video={video} onLeave={onLeave} title={title} />
    </LiveKitRoom>
  );
}

function Btn({ icon, label, onPress, on, danger, c }: { icon: string; label: string; onPress: () => void; on?: boolean; danger?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? c.bad : on ? c.surface : 'rgba(255,255,255,0.18)' }}>
        <SymbolView name={icon as never} tintColor={danger ? '#ffffff' : on ? c.text : '#ffffff'} size={26} />
      </View>
      <Text style={{ color: '#ffffff', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Stage({ c, video, onLeave, title }: { c: Palette; video: boolean; onLeave: (othersStillOn?: number) => void; title: string }) {
  const tracks = useTracks([Track.Source.Camera]);
  const people = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const remoteVideo = tracks.filter((t) => isTrackReference(t) && !t.participant.isLocal);
  const localVideo = tracks.find((t) => isTrackReference(t) && t.participant.isLocal);
  const others = people.filter((p) => !p.isLocal);

  return (
    <View style={{ flex: 1, backgroundColor: '#0b1214' }}>
      {video && remoteVideo.length ? (
        <View style={{ flex: 1, gap: 2 }}>
          {remoteVideo.map((t) => (isTrackReference(t) ? <VideoTrack key={t.participant.identity} trackRef={t} style={{ flex: 1 }} objectFit="cover" /> : null))}
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
          <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
          <Text style={{ color: '#b8c7ca', fontSize: 16 }}>
            {others.length ? `On the call: ${others.map((p) => p.name || 'Family member').join(', ')}` : 'Ringing…'}
          </Text>
        </View>
      )}
      {video && localVideo && isTrackReference(localVideo) && isCameraEnabled ? (
        <VideoTrack trackRef={localVideo} mirror objectFit="cover" zOrder={1}
          style={{ position: 'absolute', top: 70, right: 16, width: 110, height: 160, borderRadius: 12, overflow: 'hidden' }} />
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 28, paddingBottom: 48, backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Btn c={c} icon={isMicrophoneEnabled ? 'mic.fill' : 'mic.slash.fill'} label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} on={!isMicrophoneEnabled}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)} />
        <Btn c={c} icon={isCameraEnabled ? 'video.fill' : 'video.slash.fill'} label={isCameraEnabled ? 'Camera off' : 'Camera on'} on={!isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)} />
        <Btn c={c} icon="phone.down.fill" label="End" danger onPress={() => onLeave(others.length)} />
      </View>
    </View>
  );
}
