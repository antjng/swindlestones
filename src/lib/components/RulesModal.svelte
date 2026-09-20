<script lang="ts">
  import { STARTING_DICE } from '../game/match';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
</script>

<div class="overlay">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <h2 id="rules-title">How to Play</h2>

    <ol>
      <li>
        You and your opponent each begin with {STARTING_DICE} dice. Each die has eight faces, two
        each of 1, 2, 3 and 4 pips. You may look at your own dice; your opponent's stay hidden under
        his hand.
      </li>
      <li>
        Take turns making a <strong>bid</strong>: a claim about how many dice of one number lie on
        the table in all, yours and theirs together. "Three 2s" means at least three dice showing
        two pips.
      </li>
      <li>
        Each bid must beat the one before it, with more dice, or the same count of a higher number.
        Two 3s beats two 2s, and three 1s beats two 4s.
      </li>
      <li>
        Instead of bidding, you may <strong>call</strong> once a bid has been made, doubting it. His
        hand is lifted and every die is counted.
      </li>
      <li>
        If the bid holds, the caller loses a die. If it falls short, the bidder loses one. The loser
        opens the next round.
      </li>
      <li>Lose your last die and the match is lost.</li>
      <li>To bid, pick the number of pips, choose how many, and press <strong>Bid</strong>.</li>
    </ol>

    <p class="actions"><button onclick={onClose}>To the table</button></p>
  </div>
</div>

<style>
  ol {
    margin: 0;
    padding-left: 1.4rem;
  }
  li {
    margin-bottom: 0.6rem;
  }
  .actions {
    margin: 1.25rem 0 0;
    text-align: center;
  }
</style>
