/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class blockedWords1708046916047 {
    name = 'blockedWords1708046916047'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "blockedWords" character varying(1024) array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "blockedWords"`);
    }
}
