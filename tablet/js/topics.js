// "Ask about…" topics for the communicator (phase 3). Each crew member has a few things the Captain can ask about.
// A topic unlocks with how often the Captain has said hello to that person (progress.talk.<id>.n), with a lesson flag, or after another topic.
// It is told once and then marked (progress.topics.<id>.told). A topic with `declines: true` is never told: the person puts the Captain off, a little
// differently each time (this is how ARIA handles Captain Voss, the first long thread; see STORY_BIBLE.md).
// when: { talk: n, flag: 'name', after: 'topic id' }.  lines: spoken together as one reply.
import { gameState } from './persist.js';
import { fill } from './player.js';

export const SHUTTLE_NAME = 'Tern';   // the Aqua Nova's away boat (the Sea Crab belongs to another ship)

const T = (id, label, when, lines, extra = {}) => ({ id, label, when, lines: Array.isArray(lines) ? lines : [lines], ...extra });
export const TOPICS = {
  executiveOfficer: [
    T('ship', 'the Aqua Nova', {}, 'O.E.R.A. built her at Woods Hole, with several nations paying the bill and each wanting a say in the drawings. She dives deeper than anything the Alliance has fielded, and she can come back, which was the Admiral\'s main requirement. I keep her log. I would like to keep it dull.'),
    T('aria', 'how she works', { talk: 2 }, 'I was built from decades of deep-sea mission records, and I was made a member of the crew, not a tool. I will tell you what I think, I will tell you when I disagree, and I will say so on the record. I do not claim to feel things. I do claim to care how this goes, and I have not found a difference that matters yet.'),
    T('okafor', 'Admiral Okafor', { talk: 3 }, 'Admiral Okafor argued for years for a ship that could go where no one else could and still return. She answers to a board and to the governments that fund it, and they want different things. She chose you personally, {captain}. She did not tell me why, and I did not ask. I was told I would learn.'),
    T('voss', 'Captain Voss', { talk: 1 }, [
      'I would rather not, {captain}. Not yet.',
      'I know what you are asking, and I know why. I am not going to answer, and I will not pretend there is nothing to answer.',
      'Captain Voss was relieved of command a few days before sea trials. I was in the room. I have not said what I saw, and I am not going to say it today.',
      'I will not lie to you about this, {captain}. I will only decline. You may find out for yourself in time. If you do, I would ask that you come and tell me what you found before you decide what it means.',
    ], { declines: true }),
  ],
  helm: [
    T('boats', 'the small boats', {}, ['Nine years on small boats in bad water. A coxswain learns that the sea is never the problem. The problem is the five minutes when everybody else is in a hurry.', 'We carry one of our own, the Tern, in the launch bay. Twenty knots and about six hours on a charge. She ferries crew and supplies, so the boat does not have to tie up to do it. I like her already, and she is not even mine to drive.']),
    T('ferry', 'ferrying scientists', { talk: 3 }, 'Before this I ferried scientists out to a research submarine. Lovely people, no sense of the swell. One of them was sick over the side every morning and then asked, very politely, if we could go faster. I think of her whenever someone tells me it is an easy sea.'),
    T('chens', 'the two Chens', { talk: 4 }, 'No relation. Ryan and I were both asked in the first week, and we have both stopped explaining. If you want to settle it, he has the engine room and I have the wheel, and between us we have one boat.'),
  ],
  science: [
    T('years', 'her years at sea', {}, 'Three expeditions as the ship\'s doctor, and before that an emergency department, which is where I learned to stay calm when the room is not. Then I got curious about what lives down there, and went back to school in my thirties. Marine biology is the same job with better colours and fewer questions about insurance.'),
    T('gerald', 'the plant', { talk: 4 }, 'Gerald is a pothos, and I will not be told that he does nothing for the air. He came with me on the last two expeditions. He has been through a storm and a fire drill and has not lost a leaf.'),
    T('voss', 'Captain Voss', { talk: 6 }, 'Captain Voss chose me herself. She was direct about it: she said she needed a doctor who would say what she did not want to hear. I do not know why she was relieved, {captain}. I would like to. I do not think ARIA will tell either of us, and I have stopped being sure that is the same as not knowing.'),
  ],
  sensors: [
    T('shack', 'the sonar shack', {}, 'Six years in a Navy sonar shack. You sit in the dark, you listen, and you learn that most of what you hear is the sea clearing its throat. You learn to say what you are sure of and not a word more. It does not make you popular at parties.'),
    T('probably', 'saying "probably"', { talk: 3 }, 'I say "probably" when I am not certain, and I am rarely certain. I have heard there is a pool on how often I say it in a watch. I am not going to ask the odds. I will tell you that when I drop the word, {captain}, I mean it.'),
    T('unsure', 'a contact he is not sure about', { talk: 6 }, 'In my last boat I once held a contact for forty minutes that never became anything. The officer of the watch asked me whether it was real. I said probably. We never found out. I think about that more than the ones I got right.'),
  ],
  engineering: [
    T('plant', 'the fusion plant', {}, 'I came off merchant ship engine rooms and onto the team that commissioned the plant. It is a better engine than anything I grew up with and it is more polite than any of them. I still talk to it when I think nobody is listening. So far it has not said anything back.'),
    T('marcus', 'Marcus Chen', { talk: 3 }, 'No relation. I have said it so many times that I have started to say it in my sleep. If he hears the noise from below the deck, that is not the plant, that is me practising.'),
    T('parts', 'fixing things', { talk: 5 }, 'I fix things with whatever is lying about. A good engineer does not have the right part. A good engineer knows which three other parts will do, and in what order to ask for them. If a pump dies on us, {captain}, you will want me and a box of nothing in particular.'),
  ],
  security: [
    T('boarding', 'boarding work', {}, 'Navy special warfare first, then maritime boarding. You learn to walk into a room you do not control and make it yours before anybody has decided to be afraid. It is mostly talking. I would like it to stay mostly talking.'),
    T('why', 'why a research ship needs security', { talk: 3 }, 'Because a ship that goes deeper than anyone else will meet something it cannot talk to, {captain}. It might be a storm, or a stranger, or a find that somebody wants quiet. The scientists are right that this is a research ship. I am here in case that is not the only thing it is.'),
    T('voss', 'Captain Voss', { talk: 6 }, 'Captain Voss insisted I come aboard, over the science side\'s objections. I understood her. I do not know why she left, and I have been told not to speculate, which is easier to follow when you do not have a theory. I do not have one. I have several, and I am being disciplined about it.'),
  ],
  communications: [
    T('polar', 'the polar station', {}, 'Four years at a polar station with one satellite window twice a day. You learn very quickly what a delayed message costs. You learn to say the thing that matters in the first line. Out here I have a laser and three satellites, and I still write the first line first.'),
    T('old', 'old frequencies', { talk: 3 }, 'I like the old bands. Nobody else listens to them, so what you hear is either nothing or somebody who really needs to be heard. It is quiet most of the time, {captain}. I leave the set on anyway.'),
    T('delay', 'delayed messages', { talk: 5 }, 'A message that arrives late is a different message. The person who wrote it has moved on and the one who reads it has not heard the news. I read the date line before the rest. If you ever send something that cannot wait, tell me, and I will find a way to make it arrive on time.'),
  ],
};

const rec = (id) => gameState.getProperty('progress.topics.' + id) || { told: [], asked: {} };
const talkN = (id) => (gameState.getProperty('progress.talk.' + id) || { n: 0 }).n || 0;
const flagOn = (k) => !!(gameState.getProperty('progress.flags') || {})[k];
const open = (id, t) => { const w = t.when || {}, r = rec(id); return (w.talk == null || talkN(id) >= w.talk) && (!w.flag || flagOn(w.flag)) && (!w.after || r.told.includes(w.after)); };

/** Topics this person has to offer right now: [{ id, label, told }]. */
export const topicsFor = (id) => { const r = rec(id); return (TOPICS[id] || []).filter((t) => open(id, t)).map((t) => ({ id: t.id, label: t.label, told: r.told.includes(t.id) })); };

/** Ask about a topic. Returns the reply text. A topic is told once; a second ask gets a short answer. A declined topic is declined again, a little differently. */
export function askTopic(crewId, topicId) {
  const t = (TOPICS[crewId] || []).find((x) => x.id === topicId); if (!t || !open(crewId, t)) return null;
  const r = rec(crewId);
  if (t.declines) {
    const k = r.asked[t.id] || 0; r.asked[t.id] = k + 1;
    gameState.updateProperty('progress.topics.' + crewId, r);
    return fill(t.lines[Math.min(k, t.lines.length - 1)]);
  }
  if (r.told.includes(t.id)) return fill('I have told you what I can about that, {captain}. Ask me something else.');
  r.told.push(t.id); gameState.updateProperty('progress.topics.' + crewId, r);
  return fill(t.lines.join(' '));
}
