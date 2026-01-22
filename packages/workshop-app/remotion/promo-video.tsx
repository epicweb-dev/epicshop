import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { HookScene } from './scenes/hook-scene.tsx'
import { DemoScene } from './scenes/demo-scene.tsx'
import { FeaturesScene } from './scenes/features-scene.tsx'
import { MomentumScene } from './scenes/momentum-scene.tsx'
import { CtaScene } from './scenes/cta-scene.tsx'

export type PromoVideoProps = {
	title: string
	tagline: string
	cta: string
	baseUrl: string
}

const durations = {
	hook: 150,
	demo: 180,
	features: 150,
	momentum: 150,
	cta: 138,
}

const transitionDuration = 12
const transitionTiming = linearTiming({ durationInFrames: transitionDuration })

export const promoVideoDurationInFrames =
	durations.hook +
	durations.demo +
	durations.features +
	durations.momentum +
	durations.cta -
	transitionDuration * 4

function PromoAudio() {
	const frame = useCurrentFrame()
	const { durationInFrames, fps } = useVideoConfig()

	const fadeIn = Math.min(frame / (0.6 * fps), 1)
	const fadeOut = Math.min((durationInFrames - frame) / (0.8 * fps), 1)
	const volume = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.35

	return (
		<Audio
			src={staticFile('remotion/tech-house-pulse.mp3')}
			startFrom={20}
			volume={volume}
		/>
	)
}

export function PromoVideo({ title, tagline, cta, baseUrl }: PromoVideoProps) {
	return (
		<AbsoluteFill style={{ backgroundColor: '#050505' }}>
			<PromoAudio />
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={durations.hook}>
					<HookScene title={title} tagline={tagline} />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={fade()}
					timing={transitionTiming}
				/>
				<TransitionSeries.Sequence durationInFrames={durations.demo}>
					<DemoScene baseUrl={baseUrl} />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={slide({ direction: 'from-bottom' })}
					timing={transitionTiming}
				/>
				<TransitionSeries.Sequence durationInFrames={durations.features}>
					<FeaturesScene />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={slide({ direction: 'from-right' })}
					timing={transitionTiming}
				/>
				<TransitionSeries.Sequence durationInFrames={durations.momentum}>
					<MomentumScene />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={fade()}
					timing={transitionTiming}
				/>
				<TransitionSeries.Sequence durationInFrames={durations.cta}>
					<CtaScene cta={cta} />
				</TransitionSeries.Sequence>
			</TransitionSeries>
		</AbsoluteFill>
	)
}
