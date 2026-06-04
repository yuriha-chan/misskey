/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RecommendedEmojiPalettes1780506446091 {
    name = 'RecommendedEmojiPalettes1780506446091';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" ADD "recommendedEmojiPalettes" jsonb NOT NULL DEFAULT \'[]\'');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "recommendedEmojiPalettes"');
    }
};
