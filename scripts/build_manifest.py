#!/usr/bin/env python3
"""Builds src/audio/manifest.json for Ace Runs!: every voice line, sound effect,
ambience bed and music cue. The game selects voice lines by (speaker, group) and
plays effects / music by id; scripts/generate_audio.mjs generates every entry
with ElevenLabs from the same text and prompts.

Voice ids are <speaker>_<group>_<n> (n from 1). `text` is what is shown / meant;
`tts` is the text sent to text-to-speech (request-only delivery tags and
punctuation tweaks live in generate_audio.mjs so the manifest stays clean).

Run:  python3 scripts/build_manifest.py
"""
import json
import os

E = []
_counts = {}


def line(speaker, group, text, tts=None):
    key = (speaker, group)
    _counts[key] = _counts.get(key, 0) + 1
    i = f'{speaker}_{group}_{_counts[key]}'
    E.append(dict(id=i, kind='voice', speaker=speaker, group=group, text=text, tts=tts or text,
                  file=f'audio/voice/{i}.mp3'))


def lines(speaker, group, *texts):
    for t in texts:
        line(speaker, group, t)


def sfx(i, prompt, dur, group, variants=None, volume=None, loop=False):
    d = dict(id=i, kind='sfx', group=group, prompt=prompt, file=f'audio/sfx/{i}.mp3', duration=dur)
    if variants:
        d['variants'] = variants
    if loop:
        d['loop'] = True
    if volume is not None:
        d['volume'] = volume
    E.append(d)


def amb(i, prompt, group, dur=22, volume=None):
    d = dict(id=i, kind='ambience', group=group, prompt=prompt, duration=dur, loop=True,
             file=f'audio/ambience/{i}.mp3')
    if volume is not None:
        d['volume'] = volume
    E.append(d)


def mus(i, prompt, group, dur=70, volume=None):
    d = dict(id=i, kind='music', group=group, prompt=prompt, duration=dur, loop=True,
             file=f'audio/music/{i}.mp3')
    if volume is not None:
        d['volume'] = volume
    E.append(d)


# ===================================================================== Ace (cheerful Kiwi boy)
A = 'ace'
lines(A, 'hello', "Kia ora! I'm Ace!", 'Hey there! Ace here, ready to run!')
lines(A, 'ride_shoes', 'Running shoes! Super speedy feet!')
lines(A, 'ride_bike', 'My bike! Ding ding, here I come!')
lines(A, 'ride_scooter', 'Scooter time! Kick, kick, zoom!')
lines(A, 'ride_skate', "Skateboard! Sweet as, let's cruise!")
lines(A, 'start', "Let's go!", 'Here we go, eh!', "Ready? Let's run!")
lines(A, 'yum', 'Yum!', 'Sweet as!', 'Ka pai!', 'Chur!', 'Mmm, crunchy!', 'Choice!', 'Heaps good!', 'Good as gold!')
lines(A, 'vision', 'Whoa, I can see heaps!', 'My eyes are super sparkly!')
lines(A, 'muscles', 'Look at my muscles!', 'Super strong, eh!')
lines(A, 'bones', 'Strong bones!', 'Shiny strong teeth!')
lines(A, 'shield', 'Germs, bounce off!', 'Shield up! No germs allowed!')
lines(A, 'energy', 'Zoom!', 'Whoa, so much energy!')
lines(A, 'refresh', 'Ahh, refreshing!', 'Water! Sweet as!')
lines(A, 'grow', 'Growing big and strong!', 'Food friends, come to me!')
lines(A, 'tummy_happy', 'Happy tummy!', 'Mmm, my tummy loves that!')
lines(A, 'sugar', 'Whoa, too fizzy!... So sleepy...', 'Zoom, zoom... ohh, now I need a nap.')
lines(A, 'teeth', 'Ugh, sticky teeth!', 'Oh no, sticky teeth! Time to brush!')
lines(A, 'freeze', 'Brrr, brain freeze!')
lines(A, 'slow', 'I feel so slow...', 'Ohh, my legs feel all sleepy...')
lines(A, 'tummy', 'Oh no, my tummy!', 'Ooh, rumbly tummy!')
lines(A, 'bounce_back', 'I feel better already!', 'Back to my best! Ka pai!')
lines(A, 'bump', 'Oops!', 'Whoa!', "I'm okay!")
lines(A, 'near_miss', 'Phew!', 'Close one!', 'Whoa, just made it!')
lines(A, 'jump', 'Hup!', 'Wheee!', 'Yah!')
lines(A, 'glow_full', 'Healthy and happy!', "I'm glowing! Choice!")
lines(A, 'shield_block', 'Ha! Bounced off!')
lines(A, 'finish', 'We made it! Woo-hoo!', 'Finish line! Sweet as!')
lines(A, 'results_great', 'Look at all that yummy food! Heaps good!', 'Best run ever, eh!')
lines(A, 'results_ok', "Let's have another go!", 'Good try! One more run?')
lines(A, 'new_food', 'A new food friend!', 'Ooh, a new food for my book!')
lines(A, 'unlock', 'A new place to explore!')
lines(A, 'idle', 'Ready when you are!', 'Which way shall we go?', "Come on, let's run, eh?")

# ===================================================================== Ciela (cheerful Kiwi girl; say "SYEH-lah")
# Renamed from Moana in v1.0.1. Her request-only pronunciation respelling lives in generate_audio.mjs.
M = 'ciela'
lines(M, 'hello', "Kia ora! I'm Ciela!", "Hi! Ciela here! Let's have some fun!")
lines(M, 'ride_shoes', 'Running shoes on! Fast feet!')
lines(M, 'ride_bike', 'Bike ride! Ring, ring!')
lines(M, 'ride_scooter', 'My scooter! Push and glide!')
lines(M, 'ride_skate', "Skateboard! Let's carve it up!")
lines(M, 'start', "Let's go!", 'Here we go, eh!', 'Ready, steady, run!')
lines(M, 'yum', 'Yum yum!', 'Sweet as!', 'Ka pai!', 'Good as gold!', 'Mmm, juicy!', 'So yummy!', 'Heaps good!', 'Choice!')
lines(M, 'vision', "Ooh, everything's so bright!", 'Sparkly eyes! I can see heaps!')
lines(M, 'muscles', 'Strong as!', 'Flex! Look how strong I am!')
lines(M, 'bones', 'Strong bones and teeth!', 'Ting! Shiny teeth!')
lines(M, 'shield', 'Bubble shield! Germs, go away!', 'No germs on me!')
lines(M, 'energy', 'Zoom, zoom!', 'Whee, so speedy!')
lines(M, 'refresh', "Ahh, that's better!", 'Splash! So refreshing!')
lines(M, 'grow', 'Growing strong!', 'Food friends, fly to me!')
lines(M, 'tummy_happy', "My tummy's smiling!", 'Happy tummy, happy me!')
lines(M, 'sugar', "Wheee, so fizzy!... Now I'm sleepy...", 'Too much sugar... I need a nap...')
lines(M, 'teeth', 'Ugh, sticky teeth!', 'Oh no, my teeth feel all gluey!')
lines(M, 'freeze', 'Ooh, brain freeze! Brrr!')
lines(M, 'slow', "Ohh, I'm so slow...", 'My legs feel so heavy...')
lines(M, 'tummy', 'Oh no, my tummy!', 'Uh oh, grumbly tummy!')
lines(M, 'bounce_back', 'Yay, I feel better!', 'All better! Good as gold!')
lines(M, 'bump', 'Oopsie!', 'Whoops!', "I'm okay!")
lines(M, 'near_miss', 'Phew!', 'Close one!', 'Ooh, that was close!')
lines(M, 'jump', 'Hup!', 'Wheee!', 'Hop!')
lines(M, 'glow_full', 'Healthy and happy!', "I'm all glowy! Sweet as!")
lines(M, 'shield_block', 'Ha! Bounced right off!')
lines(M, 'finish', 'We did it! Yay!', 'Finish line! Choice!')
lines(M, 'results_great', 'Wow, look at all our food friends!', 'That was the best! Heaps good!')
lines(M, 'results_ok', "Let's have another go!", "Nice try! Let's go again!")
lines(M, 'new_food', 'A new food friend!', 'Ooh, someone new for our book!')
lines(M, 'unlock', 'Ooh, a new place to explore!')
lines(M, 'idle', "Let's go on an adventure!", 'Pick a ride, eh!', 'I love fruit and veggies!')

# ===================================================================== Narrator (warm Kiwi announcer)
N = 'narrator'
lines(N, 'title', 'Ace Runs!')
lines(N, 'welcome', 'Kia ora! Welcome to Ace Runs!', 'Kia ora, friend! Ready for a healthy adventure?')
lines(N, 'pick_character', "Who's going to run today?")
lines(N, 'char_ace', 'Ace!')
lines(N, 'char_ciela', 'Ciela!')
lines(N, 'pick_ride', 'How will you travel?')
lines(N, 'ride_shoes', 'Running shoes!')
lines(N, 'ride_bike', 'The bike!')
lines(N, 'ride_scooter', 'The scooter!')
lines(N, 'ride_skate', 'The skateboard!')
lines(N, 'pick_stage', 'Where shall we run today?')
lines(N, 'stage_indoor', 'The indoor playground! Soft play, ball pits and slides!')
lines(N, 'stage_arcade', 'The arcade! Glowing games, claw machines and prizes!')
lines(N, 'stage_outdoor', 'The outdoor playground! Swings, see-saws and the roundabout!')
lines(N, 'stage_sports', 'The sports park! Rugby, netball, cricket and heaps more!')
lines(N, 'stage_jungle', 'The jungle! Swinging monkeys, ambling elephants and hopping frogs!')
lines(N, 'stage_parks', "The parks and gardens! Let's run through all four seasons!")
for sport, txt in [('rugby', 'Rugby!'), ('football', 'Football!'), ('netball', 'Netball!'), ('basketball', 'Basketball!'),
                   ('cricket', 'Cricket!'), ('tennis', 'Tennis!'), ('hockey', 'Hockey!'), ('athletics', 'Athletics!'),
                   ('swimming', 'Swimming!'), ('cycling', 'Cycling!')]:
    lines(N, f'sport_{sport}', txt)
lines(N, 'season_winter', "It's winter! Frosty, snowy and bare branches!")
lines(N, 'season_spring', 'Spring! Blossom, lambs and new shoots!')
lines(N, 'season_summer', 'Summer! Sunshine, picnics and big green trees!')
lines(N, 'season_autumn', 'Autumn! Golden leaves falling and puddles!')
lines(N, 'benefit_vision', 'Carrots help your eyes!', 'Carrots help you see bright and clear!')
lines(N, 'benefit_muscles', 'Green veggies build strong muscles!', 'Broccoli and spinach make you strong!')
lines(N, 'benefit_bones', 'Dairy makes strong bones and teeth!', 'Milk, yoghurt and cheese for strong bones!')
lines(N, 'benefit_shield', 'Oranges and kiwifruit help fight germs!', 'Fruit helps your body fight off germs!')
lines(N, 'benefit_energy', 'Bananas give you zippy energy!', 'Energy food! Off you zoom!')
lines(N, 'benefit_refresh', 'Water is the best drink!', 'A splash of water! So refreshing!')
lines(N, 'benefit_grow', 'Eggs, chicken and fish help you grow strong!', 'Growing strong! Food friends fly to you!')
lines(N, 'benefit_tummy', 'Fruit and veggies make a happy tummy!', 'Wholesome food, happy tummy!')
lines(N, 'junk_sugar', 'Fizzy drinks give a quick buzz, then a sleepy slump.')
lines(N, 'junk_teeth', 'Lollies make teeth sticky. Remember to brush!')
lines(N, 'junk_freeze', 'Ice cream is a chilly sometimes treat!')
lines(N, 'junk_slow', 'Greasy food can make you feel slow for a while.')
lines(N, 'junk_tummy', 'Old food can upset your tummy. Grab something fresh!')
lines(N, 'sometimes', 'Treats are sometimes foods!', 'Healthy food makes you strong every day!',
      'Water and fresh food help you bounce back!')
lines(N, 'glow_full', 'Healthy and happy!')
lines(N, 'countdown', 'Ready... set... go!')
lines(N, 'tut_intro', "Let's learn the moves!")
lines(N, 'tut_left', 'Move left!')
lines(N, 'tut_right', 'Move right!')
lines(N, 'tut_jump', 'Jump over the low things!')
lines(N, 'tut_slide', 'Slide under the high things!')
lines(N, 'tut_healthy', 'Healthy food powers you up!')
lines(N, 'tut_junk', 'Junk food slows you down for a while - treats are sometimes foods!')
lines(N, 'tut_done', "You've got it! Off you go!")
lines(N, 'finish', 'Finish line! Well done!')
lines(N, 'results', 'Look at all the healthy food you collected!', "What a run! Let's see your food friends!")
lines(N, 'results_great', "Amazing! You're a healthy hero!")
lines(N, 'results_try', "Great try! Let's go again!")
lines(N, 'unlock', 'A new place has opened up!')
lines(N, 'new_food', 'A new food friend for your book!')
lines(N, 'book', 'Your food friends book!')
lines(N, 'paused', 'Paused. Take a breather!')
lines(N, 'endless', 'Endless run! How far can you go?')
lines(N, 'last_season', 'You ran through every season!')

# ===================================================================== Warm-up / cool-down stretches (v1.0.1)
# Character lines avoid saying Ciela's name (no respelling needed).
lines(A, 'warmup_go', "Let's warm up!", 'Warm-up time, eh!')
lines(A, 'stretch_cheer', "Sweet as, I'm all warm!", 'Ka pai!', 'Choice, my muscles are ready!')
lines(A, 'ready', 'Ready to go!', "All warmed up! Let's go!")
lines(A, 'cooldown_go', 'Time to cool down!')
lines(A, 'cooldown_done', 'Ahh, I feel all bendy!', 'Nice and relaxed. Sweet as!')

lines(M, 'warmup_go', 'Warm-up time!', "Let's get our bodies ready, eh!")
lines(M, 'stretch_cheer', "Heaps good, I'm all warm!", 'Ka pai!', "Good as gold! I'm warm now!")
lines(M, 'ready', "I'm ready to go!", "Warm muscles! Let's run!")
lines(M, 'cooldown_go', "Let's cool down now!")
lines(M, 'cooldown_done', 'Ahh, so stretchy and calm!', 'My body feels happy!')

lines(N, 'warmup_intro', "Let's warm up our bodies!", 'Warm-up time! Wiggle and move with me!')
lines(N, 'stretch_with_me', 'Stretch with me! Copy the moves!')
for n, word in enumerate(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'], 1):
    lines(N, f'count_{n}', f'{word}!')
MOVE_LINES = [
    # warm-up (dynamic)
    ('look', 'Look left... and right!'), ('nod', 'Nod your head, up and down!'), ('arm_circles', 'Arm circles!'),
    ('arm_swings', 'Big arm swings!'), ('torso_twist', 'Twist your body, side to side!'), ('side_bend', 'Bend to the side!'),
    ('high_knees', 'High knees!'), ('leg_swings', 'Leg swings!'), ('hops', 'Little hops!'), ('ankle_circles', 'Circle your ankles!'),
    # cool-down (static holds)
    ('reach_sky', 'Reach up to the sky!'), ('side_reach', 'Reach over to the side!'), ('shoulder_stretch', 'Hug your arm across your chest!'),
    ('quad_stretch', 'Hold your foot behind you!'), ('calf_stretch', 'Step back and stretch your calf!'), ('toe_touch', 'Reach down to your toes!'),
    ('butterfly', 'Sit like a butterfly!'), ('breathe', 'Breathe in... and out.'),
]
for move, txt in MOVE_LINES:
    lines(N, f'move_{move}', txt)
lines(N, 'ready', 'Warm muscles! Ready to go!')
lines(N, 'cooldown_intro', "Great running! Let's cool down.")
lines(N, 'breathe_in', 'Breathe in...')
line(N, 'breathe_out', '...and out.', tts='And out...')
lines(N, 'stretch_happy', 'Stretching keeps your body happy!', 'Stretchy muscles are happy muscles!')
lines(N, 'hold', 'Hold it... nice and still.')

sfx('stretch_whoosh', 'soft slow airy whoosh, like a gentle stretch, calm', 0.7, 'stretch', volume=0.5)
sfx('hold_chime', 'gentle soft single chime, warm and calm, a hold is complete', 1.0, 'stretch', volume=0.6)
sfx('ready_sparkle', 'short bright magical sparkle with a tiny rising twinkle, ready to go', 1.0, 'stretch', volume=0.7)

# ===================================================================== SFX: UI
sfx('ui_click', 'soft rounded UI click like tapping a wooden toy block, very short', 0.3, 'ui', volume=0.7)
sfx('ui_back', 'soft gentle descending UI swoosh for going back, very short', 0.4, 'ui', volume=0.6)
sfx('ui_select', 'happy bubbly pop with a tiny bright chime, menu selection confirm', 0.5, 'ui', volume=0.8)
sfx('ui_unlock', 'sparkly magical unlock chime, twinkling bells rising, joyful', 2.0, 'ui')
sfx('ui_page', 'paper book page turning, soft and crisp', 0.6, 'ui', volume=0.8)
sfx('star', 'bright clear glockenspiel ding with a sparkly shimmer as a star appears, clear and present', 0.8, 'ui')

# ===================================================================== SFX: moves
sfx('whoosh_lane', 'very short soft airy whoosh of quickly moving sideways', 0.3, 'moves', variants=3, volume=0.55)
sfx('jump', 'soft springy cartoon boing with a light whoosh upward, playful jump', 0.4, 'moves', volume=0.6)
sfx('land', 'soft padded thump of sneakers landing, gentle', 0.3, 'moves', volume=0.6)
sfx('slide', 'quick smooth swish of sliding low along the ground', 0.5, 'moves', volume=0.6)
sfx('bump', 'soft padded cartoon bonk on a cushion, squishy and funny, not painful', 0.5, 'moves', volume=0.8)
sfx('near_miss', 'zippy quick whoosh followed by a bright tiny ding', 0.6, 'moves', volume=0.7)
sfx('bonk', 'cartoon boing knock as an object gets bumped away, springy and funny', 0.6, 'moves')
sfx('shield_bounce', 'wobbly soap bubble boing, rubbery and bouncy, magical', 0.7, 'moves')
sfx('countdown_beep', 'soft friendly countdown beep tone, single', 0.3, 'moves', volume=0.7)
sfx('go', 'cheerful bright go chime with a little upward whoosh', 0.7, 'moves')
sfx('finish_fanfare', 'short happy celebration fanfare on soft brass, xylophone and handclaps', 3.0, 'moves')
sfx('stage_clear', 'joyful short success jingle on xylophone and chimes', 2.0, 'moves')
sfx('heart_up', 'warm cute rising bloop chime, getting a heart back', 0.7, 'moves')

# ===================================================================== SFX: food
sfx('bite_crunch', 'crisp crunchy bite of a fresh raw carrot, close and munchy', 0.5, 'food', variants=3)
sfx('bite_juicy', 'juicy fresh fruit bite, a crisp apple crunch with a little squirt of juice', 0.5, 'food', variants=3)
sfx('bite_soft', 'soft gentle bite of a banana or soft bread, quiet and pleasant', 0.4, 'food', variants=2)
sfx('slurp_drink', 'quick gulp of a cool drink from a glass, refreshing', 0.7, 'food', variants=2)
sfx('splash_water', 'refreshing playful water splash with a few sparkling droplets', 0.8, 'food')
sfx('sparkle_vision', 'twinkly magical sparkle shimmer, bright little bells', 1.0, 'food')
sfx('flex_muscle', 'cartoon power-up flex sound, a springy rising twang with a punchy pop, no voice', 0.7, 'food')
sfx('ding_bones', 'bright clean high ting like a shiny tooth sparkle, single', 0.6, 'food')
sfx('shield_up', 'soft bubbly whoomp as a glowing bubble shield inflates, magical', 0.8, 'food')
sfx('zoom_boost', 'zippy cartoon speed burst whoosh, rising and exciting', 0.8, 'food')
sfx('magnet', 'gentle magical pulling hum with soft twinkles, swirling', 1.2, 'food')
sfx('grow_chart', 'quick cheerful rising arpeggio on marimba, growing taller', 1.0, 'food')
sfx('happy_tummy', 'warm cosy soft chime, content and comforting', 0.8, 'food')
sfx('glow_level', 'soft rising chime with gentle shimmer, level up', 0.8, 'food')
sfx('glow_full', 'warm sparkly magical swell with chimes, glowing and joyful', 1.8, 'food')
sfx('bounce_back', 'refreshing bright chime like a fresh breeze, sparkly and clean', 0.9, 'food')

# ===================================================================== SFX: junk (gentle, funny)
sfx('junk_fizz_hiss', 'soda can opening with a crisp pssst hiss and fizzing bubbles', 1.0, 'junk')
sfx('sugar_buzz', 'jittery buzzy cartoon wobble, silly and zippy', 1.0, 'junk')
sfx('sleepy_yawn', 'cartoon slide whistle sliding down slowly, then one tiny soft snore, no voice', 1.6, 'junk')
sfx('tummy_rumble', 'funny cartoon tummy rumble gurgle, silly and soft', 1.2, 'junk')
sfx('sticky_squelch', 'sticky chewy squish of toffee, playful cartoon', 0.6, 'junk')
sfx('slow_heavy', 'slow cartoon wah wah wah descending tuba, silly and gentle', 1.8, 'junk')
sfx('brain_freeze', 'brrr shivery icy jingle with tinkling ice chimes, cartoon', 1.2, 'junk')

# ===================================================================== SFX: rides (seamless loops + one-shots)
sfx('footsteps_loop', 'close-up continuous quick running footsteps of a child in sneakers on a rubber play floor, steady even rhythm, about three steps per second', 3.0, 'rides', loop=True, volume=0.5)
sfx('bike_freewheel_loop', 'bicycle freewheel ticking with a soft chain whirr, steady rolling', 3.0, 'rides', loop=True, volume=0.5)
sfx('scooter_rattle_loop', 'close-up continuous rolling rattle of small kick scooter wheels on a slightly rough pavement, steady rhythmic clatter', 3.0, 'rides', loop=True, volume=0.5)
sfx('skate_roll_loop', 'skateboard wheels rolling smoothly on concrete, steady gentle rumble', 3.0, 'rides', loop=True, volume=0.5)
sfx('bike_bell', 'classic bicycle bell ring ring, bright and friendly', 1.0, 'rides')
sfx('scooter_kick', 'foot pushing off the pavement on a kick scooter, a clear scrape and swoosh', 0.5, 'rides', volume=0.6)
sfx('skate_pop', 'skateboard ollie pop, crisp tail snap', 0.4, 'rides')
sfx('skate_land', 'skateboard landing on concrete, wheels clack and roll', 0.5, 'rides')
sfx('bike_hop', 'bicycle hop, springy tyres bouncing on the ground', 0.5, 'rides')

# ===================================================================== SFX: stages
sfx('arcade_bleep', 'friendly retro arcade game bleep bloop, short chiptune blip', 0.6, 'arcade', variants=3, volume=0.6)
sfx('claw_machine', 'toy claw machine whirring and clicking, then a soft clunk', 1.5, 'arcade', volume=0.7)
sfx('air_hockey_puck', 'air hockey puck clacking off the rail with a soft air hiss', 0.6, 'arcade', volume=0.7)
sfx('prize_ding', 'prize counter bell ding with a little ticket rattle, happy', 0.8, 'arcade')
sfx('ball_pit_rustle', 'hollow plastic balls rustling and tumbling in a ball pit, no people', 1.0, 'indoor', volume=0.7)
sfx('foam_squish', 'soft foam block squish, padded and spongy', 0.5, 'indoor', volume=0.7)
sfx('tube_slide_whee', 'playful whoosh down a plastic tube slide with a squeaky rub, no voice', 1.2, 'indoor', volume=0.7)
sfx('swing_creak', 'gentle playground swing creak, soft rhythmic', 1.5, 'outdoor', volume=0.6)
sfx('seesaw_thunk', 'wooden see-saw soft thunk as it touches down', 0.5, 'outdoor', volume=0.7)
sfx('roundabout_whirr', 'playground roundabout spinning with a soft metal whirr', 1.5, 'outdoor', volume=0.6)
sfx('sports_whistle', "referee's whistle, one short friendly blast", 0.7, 'sports', volume=0.6)
sfx('crowd_cheer', 'warm friendly crowd at a kids sports day, wordless happy cheering, hooray and clapping', 2.5, 'sports', variants=2, volume=0.6)
sfx('rugby_thud', 'rugby ball thud as it is kicked and caught', 0.5, 'sports', volume=0.7)
sfx('ball_kick', 'football being kicked, crisp thump', 0.4, 'sports', volume=0.7)
sfx('tennis_pok', 'tennis ball hit by a racquet, crisp pok', 0.3, 'sports', volume=0.7)
sfx('basketball_bounce', 'basketball bouncing twice on a wooden court', 0.8, 'sports', volume=0.7)
sfx('cricket_tok', 'cricket bat hitting a ball, wooden tok', 0.4, 'sports', volume=0.7)
sfx('swim_splash', 'playful splash into a swimming pool', 0.8, 'sports', volume=0.7)
sfx('bike_whirr', 'racing bicycle whirring past quickly', 1.0, 'sports', volume=0.6)
sfx('monkey_ooh', 'playful cheeky monkey hoots, ooh ooh ah ah, happy and friendly', 1.2, 'jungle', volume=0.6)
sfx('parrot_squawk', 'friendly colourful parrot squawk and chirp, cheerful', 0.8, 'jungle', volume=0.5)
sfx('elephant_toot', 'gentle playful elephant trumpet toot, soft and friendly, not loud', 1.2, 'jungle', volume=0.5)
sfx('frog_ribbit', 'cute little frog ribbit, two croaks', 0.6, 'jungle', volume=0.6)
sfx('bird_tweet', 'cheerful songbird tweet and warble, like a New Zealand tui bird song with bell-like notes', 1.5, 'parks', variants=2, volume=0.5)
sfx('lamb_baa', 'cute little lamb baa, soft and gentle', 0.8, 'parks', volume=0.6)
sfx('snow_crunch', 'soft footsteps crunching in fresh snow', 0.6, 'parks', volume=0.6)
sfx('leaves_rustle', 'crunchy dry autumn leaves rustling and scattering', 0.8, 'parks', volume=0.6)
sfx('puddle_splash', 'child in gumboots stomping into a shallow rain puddle, a clear wet splash', 0.8, 'parks', volume=0.7)

# ===================================================================== Ambience (seamless loops)
amb('amb_indoor', 'busy cosy indoor soft play centre, continuous cheerful chatter and giggles of children playing in the distance, plastic balls rustling, soft room echo', 'indoor', volume=0.6)
amb('amb_arcade', 'friendly family arcade, continuous soft hum of game machines, many cheerful game bleeps and jingles around the room, tickets and coins, a far-off prize bell', 'arcade', volume=0.55)
amb('amb_outdoor', 'sunny outdoor playground, continuous birdsong, breeze rustling leaves, children laughing and playing in the distance, a swing gently creaking', 'outdoor', volume=0.6)
amb('amb_sports', 'sports field on a sunny day, continuous friendly crowd murmur and light applause in the stands, an occasional far-off referee whistle, breeze', 'sports', volume=0.55)
amb('amb_jungle', 'friendly lush jungle ambience, soft insects, cheerful birds, distant playful monkeys, gentle trickling stream', 'jungle', volume=0.6)
amb('amb_winter', 'winter park, steady soft wind gusting through bare trees, light snow falling, distant crunchy footsteps in snow, occasional chirps of small winter birds', 'parks', volume=0.6)
amb('amb_spring', 'spring garden ambience, cheerful birdsong, buzzing bees, a distant lamb baa, light breeze', 'parks', volume=0.6)
amb('amb_summer', 'warm summer park ambience, cicadas, soft breeze, happy distant picnic chatter, birds', 'parks', volume=0.55)
amb('amb_autumn', 'autumn park, breeze rustling and swirling crunchy dry leaves, steady light rain pitter-patter, a few birds calling', 'parks', volume=0.6)

# ===================================================================== Music (instrumental loops)
mus('mus_title', "bright joyful theme for a children's running game, plucky ukulele and marimba melody, light shaker, handclaps, warm bass, sunny New Zealand summer feeling, catchy hummable hook, 110 bpm, instrumental", 'title', 70)
mus('mus_indoor', 'bouncy playful soft-play music for young kids, boingy pizzicato strings, toy piano, kazoo-like woodwind, soft bass and light drums, giggly and cosy, 120 bpm, instrumental', 'indoor', 65)
mus('mus_arcade', 'friendly chiptune pop for kids, bright square-wave melody, bubbly arpeggios, punchy but soft drum machine, happy and catchy, 125 bpm, instrumental', 'arcade', 65)
mus('mus_outdoor', 'sunny acoustic playground music, strummed acoustic guitar, glockenspiel, whistled-style recorder melody, light tambourine, carefree and warm, 115 bpm, instrumental', 'outdoor', 65)
mus('mus_sports', 'upbeat friendly stadium music for a kids sports day, light brass section riffs, marching snare drumline-lite, handclaps, energetic and positive but not harsh, 125 bpm, instrumental', 'sports', 65)
mus('mus_jungle', 'playful jungle adventure music for kids, marimba melody, wooden hand percussion, bongos, shakers, soft flute, curious and cheeky, 112 bpm, instrumental', 'jungle', 65)
mus('mus_parks', 'gentle orchestral and acoustic garden stroll music, light pizzicato strings, flute, clarinet, harp and soft acoustic guitar, warm and pastoral, suits all four seasons, 100 bpm, instrumental', 'parks', 70)
mus('mus_results', 'short happy celebration loop for kids, xylophone, ukulele, handclaps, proud bright brass stabs, joyful, 115 bpm, instrumental', 'results', 30)

# ===================================================================== write
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(ROOT, 'src', 'audio', 'manifest.json')

# Voice lines carry their measured clip length (from the generation log) so the game can time
# subtitles / reactions before a clip is decoded. Generation never uses `duration` for voice.
log_path = os.path.join(ROOT, 'scripts', 'audio-generation-log.json')
if os.path.exists(log_path):
    with open(log_path, encoding='utf-8') as f:
        files = json.load(f).get('files', {})
    for e in E:
        row = files.get(e['file'])
        if e['kind'] == 'voice' and row and row.get('status') == 'ok' and row.get('duration'):
            e['duration'] = round(float(row['duration']), 2)

ids = [e['id'] for e in E]
assert len(ids) == len(set(ids)), 'duplicate ids'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'entries': E}, f, indent=1, ensure_ascii=False)
    f.write('\n')
kinds = {}
for e in E:
    k = e['kind'] if e['kind'] != 'voice' else f"voice:{e['speaker']}"
    kinds[k] = kinds.get(k, 0) + 1
files = sum(e.get('variants', 1) for e in E)
print(f'wrote {out}: {len(E)} entries, {files} files', kinds)
