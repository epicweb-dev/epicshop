import { Composition } from 'remotion'
import {
	PromoVideo,
	promoVideoDurationInFrames,
	type PromoVideoProps,
} from './promo-video.tsx'

export const RemotionRoot = () => {
	return (
		<Composition
			id="PromoVideo"
			component={PromoVideo}
			durationInFrames={promoVideoDurationInFrames}
			fps={30}
			width={1920}
			height={1080}
			defaultProps={{
				title: 'Epic Workshop App',
				tagline: 'Learn by building with real code',
				cta: 'Start your workshop today',
				baseUrl: 'http://localhost:5639',
			} satisfies PromoVideoProps}
		/>
	)
}
