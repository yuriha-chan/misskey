/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChannelExplorable1758333257000 {
    name = 'ChannelExplorable1758333257000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" ADD "isExplorable" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "isExplorable"`);
    }
}
