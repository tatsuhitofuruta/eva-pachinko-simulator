import math
import unittest

import numpy as np

from eva_simulator import (
    EVA15,
    EVA17,
    GARO12,
    MachineSpec,
    calculate_hamari_prob,
    run_simulation,
    simulate_session,
)


class ProbabilityTests(unittest.TestCase):
    def test_hamari_probability_uses_geometric_miss_rate(self):
        self.assertAlmostEqual(calculate_hamari_prob(0.2, 3), 0.512)
        self.assertAlmostEqual(calculate_hamari_prob(1 / 319.7, 0), 1.0)

    def test_machine_payout_probabilities_sum_to_one(self):
        for spec in (EVA15, EVA17, GARO12):
            with self.subTest(machine=spec.name, table="heso"):
                self.assertTrue(math.isclose(sum(prob for prob, _, _ in spec.heso_payouts), 1.0))
            with self.subTest(machine=spec.name, table="denchu"):
                self.assertTrue(math.isclose(sum(prob for prob, _ in spec.denchu_payouts), 1.0))


class SimulationTests(unittest.TestCase):
    def test_no_hit_session_records_loss_without_hits(self):
        spec = MachineSpec(
            name="No Hit",
            hit_prob=0.0,
            st_hit_prob=0.0,
            border_touka=20.0,
            heso_payouts=[(1.0, 0, False)],
            denchu_payouts=[(1.0, 0)],
            jitan_spins_on_fail=0,
            zanho_count=0,
        )

        result = simulate_session(spec, total_rotations=100, rotation_per_1k=20.0)

        self.assertEqual(result.total_hits, 0)
        self.assertEqual(result.first_hit_rotation, 0)
        self.assertEqual(result.max_chain, 0)
        self.assertEqual(result.chains, [])
        self.assertAlmostEqual(result.profit, -5000.0)

    def test_guaranteed_hit_session_records_single_chain(self):
        np.random.seed(7)
        spec = MachineSpec(
            name="Guaranteed Hit",
            hit_prob=1.0,
            st_hit_prob=0.0,
            border_touka=10.0,
            heso_payouts=[(1.0, 1000, False)],
            denchu_payouts=[(1.0, 0)],
            jitan_spins_on_fail=0,
            zanho_count=0,
        )

        result = simulate_session(spec, total_rotations=1, rotation_per_1k=10.0)

        self.assertEqual(result.total_hits, 1)
        self.assertEqual(result.first_hit_rotation, 1)
        self.assertEqual(result.max_chain, 1)
        self.assertEqual(result.chains, [1])
        self.assertEqual(result.chain_details[0].total_payout, 1000)
        self.assertAlmostEqual(result.profit, 3900.0)

    def test_charge_only_session_does_not_record_figure_hit(self):
        spec = MachineSpec(
            name="Charge Only",
            hit_prob=0.0,
            st_hit_prob=0.0,
            border_touka=10.0,
            heso_payouts=[(1.0, 0, False)],
            denchu_payouts=[(1.0, 0)],
            jitan_spins_on_fail=0,
            zanho_count=0,
            charge_prob=1.0,
            charge_payout=300,
            charge_st_rate=0.0,
        )

        result = simulate_session(spec, total_rotations=1, rotation_per_1k=10.0)

        self.assertEqual(result.total_hits, 0)
        self.assertEqual(result.first_hit_rotation, 0)
        self.assertEqual(result.max_chain, 0)
        self.assertEqual(result.chains, [])
        self.assertAlmostEqual(result.profit, 1100.0)

    def test_run_simulation_returns_requested_number_of_sessions(self):
        np.random.seed(11)
        results = run_simulation(EVA15, total_rotations=5, rotation_per_1k=18.0, num_simulations=3)
        self.assertEqual(len(results), 3)


if __name__ == "__main__":
    unittest.main()
